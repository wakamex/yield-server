const ethers = require("ethers")
const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const providers = require('@defillama/sdk/build/providers.json');
const { GET_POOL_CONFIG_ABI, GET_POOL_INFO_ABI, POSITION_ABI, MARKET_ABI } = require('./abi');

const config = {
  ethereum: { registry: '0xbe082293b646cb619a638d29e8eff7cf2f46aa3a', },
  xdai: { registry: '0x666fa9ef9bca174a042c4c306b23ba8ee0c59666', },
  base: { registry: '0x6668310631Ad5a5ac92dC9549353a5BaaE16C666', },
  linea: { registry: '0x6668310631Ad5a5ac92dC9549353a5BaaE16C666', },
}

async function queryPoolHoldings(poolContract, config, name) {
  let baseTokenBalance;
  let vaultSharesBalance;
  let vaultContractAddress;

  // Query base token balance
  if (config.baseToken === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    // ETH case
    baseTokenBalance = (
      await sdk.api.eth.getBalance({
        target: poolContract.address,
        chain: config.chain
      })
    ).output;
    } else if (config.kind.toLowerCase().includes('lp')) {
    // LP token case
    const gauge_contract_address = (await sdk.api.abi.call({
      target: poolContract.address,
      chain: config.chain,
      abi: 'function gauge() view returns (address)',
    })).output;
    baseTokenBalance = (
      await sdk.api.erc20.balanceOf({
        target: gauge_contract_address,
        owner: poolContract.address,
        chain: config.chain
      })
    ).output;
  } else if (config.baseToken !== '0x0000000000000000000000000000000000000000') {
    // Standard ERC20 case
    baseTokenBalance = (
      await sdk.api.erc20.balanceOf({
        target: config.baseToken,
        owner: poolContract.address,
        chain: config.chain
      })
    ).output;
  } else {
    baseTokenBalance = '0';
  }

  // Query vault shares balance
  if (config.kind=="MorphoBlueHyperdrive") {
    vaultContractAddress = (
      await sdk.api.abi.call({
        target: poolContract.address,
        abi: 'function vault() view returns (address)',
        chain: config.chain
      })
    ).output;

    const [collateralToken, oracle, irm, lltv] = await Promise.all([
      sdk.api.abi.call({
        target: poolContract.address,
        abi: 'function collateralToken() view returns (address)',
        chain: config.chain
      }),
      sdk.api.abi.call({
        target: poolContract.address,
        abi: 'function oracle() view returns (address)',
        chain: config.chain
      }),
      sdk.api.abi.call({
        target: poolContract.address,
        abi: 'function irm() view returns (address)',
        chain: config.chain
      }),
      sdk.api.abi.call({
        target: poolContract.address,
        abi: 'function lltv() view returns (uint256)',
        chain: config.chain
      })
    ]);

    const morphoMarketId = encodeMorphoMarketIds(
      config.baseToken, collateralToken.output, oracle.output, irm.output, lltv.output
    );

    const position = (
      await sdk.api.abi.call({
        target: vaultContractAddress,
        abi: POSITION_ABI,
        params: [morphoMarketId, poolContract.address],
        chain: config.chain
      })
    ).output;

    const market = (
      await sdk.api.abi.call({
        target: vaultContractAddress,
        abi: MARKET_ABI,
        params: [morphoMarketId],
        chain: config.chain
      })
    ).output;

    const totalSupplyAssets = market.totalSupplyAssets;
    const totalSupplyShares = market.totalSupplyShares;
    const virtualAssets = 1;
    const virtualShares = 1e6;
    const vaultSharePrice = (totalSupplyAssets + virtualAssets) / (totalSupplyShares + virtualShares) * 1e12;

    vaultSharesBalance = position.supplyShares / 1e6 * vaultSharePrice;
  } else if (config.vaultSharesToken !== '0x0000000000000000000000000000000000000000') {
    vaultSharesBalance = (
      await sdk.api.erc20.balanceOf({
        target: config.vaultSharesToken,
        owner: poolContract.address,
        chain: config.chain
      })
    ).output;
  } else {
    // Use base token balance as vault shares balance
    vaultSharesBalance = baseTokenBalance;
  }

  return vaultSharesBalance;
}

function encodeMorphoMarketIds(baseToken, collateral, oracle, irm, lltv) {
  const packedIds = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'address', 'address', 'uint256'],
    [baseToken, collateral, oracle, irm, lltv]
  );
  return ethers.utils.keccak256(packedIds);
}

async function getApy(chain) {
  const registry = config[chain].registry;

  try {
    // First get the number of instances
    const numInstances = (
      await sdk.api.abi.call({
        target: registry,
        chain,
        abi: 'function getNumberOfInstances() view returns (uint256)',
      })
    ).output;

    // Then fetch each instance
    const instanceCalls = Array.from({ length: Number(numInstances) }, (_, i) => ({
      target: registry,
      params: [i],
    }));

    let instances = (
      await sdk.api.abi.multiCall({
        abi: 'function getInstanceAtIndex(uint256) view returns (address)',
        calls: instanceCalls,
        chain,
      })
    ).output.map(o => o.output);

    const poolNames = (
      await sdk.api.abi.multiCall({
        abi: 'function name() view returns (string)',
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const poolConfig = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_CONFIG_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const poolKinds = (
      await sdk.api.abi.multiCall({
        abi: 'function kind() pure returns (string)',
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    // First try to check if gauge function exists using a try-catch
    const hasGauge = await Promise.all(
      instances.map(async (instance) => {
        try {
          const result = await sdk.api.abi.call({
            target: instance,
            chain,
            abi: 'function gauge() view returns (address)',
          });
          return result.output !== "0x0000000000000000000000000000000000000000";
        } catch (e) {
          return false;
        }
      })
    );

    // Add chain and kind to each config
    poolConfig.forEach((config, index) => {
      config.chain = chain;
      config.kind = poolKinds[index];
      config.hasGauge = hasGauge[index];
    });

    // Get token addresses and fetch prices
    await Promise.all(poolConfig.map(async config => {
      let priceWithBase = false;
      let tokenAddress = config.vaultSharesToken === "0x0000000000000000000000000000000000000000"
        ? config.baseToken 
        : config.vaultSharesToken;
      let priceKey = `${chain}:${tokenAddress}`;
      config.token_contract_address = tokenAddress;
      let priceResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
      let price = priceResponse.data.coins[priceKey];
      if (price === undefined && config.baseToken !== '0x0000000000000000000000000000000000000000') {
        tokenAddress = config.baseToken;
        priceKey = `${chain}:${tokenAddress}`;
        priceResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
        price = priceResponse.data.coins[priceKey];
        config.token_contract_address = config.baseToken;
        priceWithBase = true;
      }
      // store price in config
      config.token = price;
      config.token.priceWithBase = priceWithBase;
      config.token.address = tokenAddress;
    }));

    const poolInfos = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_INFO_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const pools = poolNames.map((name, i) => ({ name, config: poolConfig[i], info: poolInfos[i], address: instances[i] }))

    const poolsData = await Promise.allSettled(
      pools.map(async (pool) => {
        try {
          const effective_share_reserves = pool.info.shareReserves - pool.info.shareAdjustment;
          const ratio = (pool.config.initialVaultSharePrice / 1e18 * effective_share_reserves) / pool.info.bondReserves;
          const spot_price = Math.pow(ratio, pool.config.timeStretch / 1e18);
          const time_stretch = pool.config.positionDuration / (365 * 24 * 60 * 60);
          const apr = (1 - spot_price) / (spot_price * time_stretch);

          // time_stretch is in fractions of a year so we can use it to convert from apr to apy
          // compounding happens every time_stretch years, so we use discrete compounding formula
          const apy = Math.pow(1 + apr * time_stretch, 1/time_stretch) - 1;
          const vaultSharesBalance = await queryPoolHoldings(pool, pool.config, pool.name);

          // in Hyperdrive, totalSupply and tvlUsd are the same because there is no borrowing
          let totalSupplyUsd = ((Number(vaultSharesBalance) || 0) / 10 ** pool.config.token.decimals) * pool.config.token.price;
          // apply vaultSharePrice from config if priceWithBase is true
          if (pool.config.token.priceWithBase) {
            totalSupplyUsd = totalSupplyUsd * pool.info.vaultSharePrice / 1e18;
          }
          let tvlUsd = Number(totalSupplyUsd) || 0;
          let totalBorrowUsd = 0;

          const result = {
            pool: pool.name,
            chain,
            project: 'hyperdrive',
            symbol: pool.config.token.symbol,
            tvlUsd,
            apy: apy * 100,
            apyBase: apy * 100,
            underlyingTokens: [pool.config.token_contract_address],
            totalSupplyUsd,
            totalBorrowUsd,
            url: `app.hyperdrive.box/market/${providers[chain].chainId}/${pool.address}`
          };
          console.log(
            `${chain.padEnd(10)} ${pool.name.padEnd(55)} (${pool.address.substring(0, 7)}) ` +
            `${Math.round(tvlUsd).toLocaleString().padStart(12)} ${pool.config.token.symbol.padEnd(14)} ` +
            `${(apy * 100).toFixed(2).padStart(5)}%`
          );
          return result;
        } catch (error) {
          console.error('Error processing pool:', pool.name, error);
          return null;
        }
      })
    );

    return poolsData
      .filter((i) => i.status === 'fulfilled')
      .map((i) => i.value);
  } catch (error) {
    console.error('Error getting APY for chain:', chain, error);
    return [];
  }
}

async function apy() {
  console.log('Chains to process:', Object.keys(config));
  // Print header only once
  console.log('network'.padEnd(10), 'pool'.padEnd(55), '(address)'.padEnd(11), 'tvl'.padStart(10), 'token'.padEnd(14), 'APR'.padStart(6));
  const pools = await Promise.allSettled(
    Object.keys(config).map(async (chain) => getApy(chain))
  );

  // append [network] to duplicate pool names
  const replaceNames = {
    xdai: "gnosis"
  }
  const uniquePoolNames = new Set();
  pools
    .filter(p => p.status === 'fulfilled')
    .forEach(promiseResult => {
      promiseResult.value.forEach(pool => {
        if (pool && uniquePoolNames.has(pool.pool)) {
          // Identify the non-ethereum pool of the pair
          const nonEthPool = pool.chain.includes('ethereum') ? pool : pool;
          // Add [network] to the non-ethereum pool name
          nonEthPool.pool = `${nonEthPool.pool} [${replaceNames[nonEthPool.chain] || nonEthPool.chain}]`;
        }
        if (pool) {
          uniquePoolNames.add(pool.pool);
        }
      });
    });

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => Boolean(p));
}

module.exports = {
  apy,
};
