const ethers = require("ethers")
const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const providers = require('@defillama/sdk/build/providers.json');

const FUTURE_REGISTRY_ADDRESS = "0x6668310631Ad5a5ac92dC9549353a5BaaE16C666"

const GET_POOL_CONFIG_ABI = {
  "inputs": [],
  "name": "getPoolConfig",
  "outputs": [{
    "components": [
      { "name": "baseToken", "type": "address" },
      { "name": "vaultSharesToken", "type": "address" },
      { "name": "linkerFactory", "type": "address" },
      { "name": "linkerCodeHash", "type": "bytes32" },
      { "name": "initialVaultSharePrice", "type": "uint256" },
      { "name": "minimumShareReserves", "type": "uint256" },
      { "name": "minimumTransactionAmount", "type": "uint256" },
      { "name": "circuitBreakerDelta", "type": "uint256" },
      { "name": "positionDuration", "type": "uint256" },
      { "name": "checkpointDuration", "type": "uint256" },
      { "name": "timeStretch", "type": "uint256" },
      { "name": "governance", "type": "address" },
      { "name": "feeCollector", "type": "address" },
      { "name": "sweepCollector", "type": "address" },
      { "name": "checkpointRewarder", "type": "address" },
      {
        "components": [
          { "name": "curve", "type": "uint256" },
          { "name": "flat", "type": "uint256" },
          { "name": "governanceLP", "type": "uint256" },
          { "name": "governanceZombie", "type": "uint256" }
        ],
        "name": "fees",
        "type": "tuple"
      }
    ],
    "name": "",
    "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
};

const GET_POOL_INFO_ABI = {
  "inputs": [],
  "name": "getPoolInfo",
  "outputs": [{
    "components": [
      { "name": "shareReserves", "type": "uint256" },
      { "name": "shareAdjustment", "type": "int256" },
      { "name": "zombieBaseProceeds", "type": "uint256" },
      { "name": "zombieShareReserves", "type": "uint256" },
      { "name": "bondReserves", "type": "uint256" },
      { "name": "lpTotalSupply", "type": "uint256" },
      { "name": "vaultSharePrice", "type": "uint256" },
      { "name": "longsOutstanding", "type": "uint256" },
      { "name": "longAverageMaturityTime", "type": "uint256" },
      { "name": "shortsOutstanding", "type": "uint256" },
      { "name": "shortAverageMaturityTime", "type": "uint256" },
      { "name": "withdrawalSharesReadyToWithdraw", "type": "uint256" },
      { "name": "withdrawalSharesProceeds", "type": "uint256" },
      { "name": "lpSharePrice", "type": "uint256" },
      { "name": "longExposure", "type": "uint256" }
    ],
    "name": "",
    "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
};

const POSITION_ABI = {
  "inputs": [
    { "name": "id", "type": "bytes32" },
    { "name": "user", "type": "address" }
  ],
  "name": "position",
  "outputs": [{
    "components": [
      { "name": "supplyShares", "type": "uint256" },
      { "name": "borrowShares", "type": "uint128" },
      { "name": "collateral", "type": "uint128" }
    ],
    "name": "",
    "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
};

const MARKET_ABI = {
  "inputs": [
    {
      "internalType": "Id",
      "name": "",
      "type": "bytes32"
    }
  ],
  "name": "market",
  "outputs": [
    {
      "internalType": "uint128",
      "name": "totalSupplyAssets",
      "type": "uint128"
    },
    {
      "internalType": "uint128",
      "name": "totalSupplyShares",
      "type": "uint128"
    },
    {
      "internalType": "uint128",
      "name": "totalBorrowAssets",
      "type": "uint128"
    },
    {
      "internalType": "uint128",
      "name": "totalBorrowShares",
      "type": "uint128"
    },
    {
      "internalType": "uint128",
      "name": "lastUpdate",
      "type": "uint128"
    },
    {
      "internalType": "uint128",
      "name": "fee",
      "type": "uint128"
    }
  ],
  "stateMutability": "view",
  "type": "function"
};

// const config = {
//   ethereum: { registry: '0xbe082293b646cb619a638d29e8eff7cf2f46aa3a', },
//   xdai: { registry: '0x666fa9ef9bca174a042c4c306b23ba8ee0c59666', },
//   base: {},
//   linea: {},
// }
const config = {
  ethereum: { registry: '0xbe082293b646cb619a638d29e8eff7cf2f46aa3a', },
}
// const config = {
//   xdai: { registry: '0x666fa9ef9bca174a042c4c306b23ba8ee0c59666', },
// }

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
  } else if (name?.includes(' LP ')) {
    // LP token case
    baseTokenBalance = (
      await sdk.api.erc20.balanceOf({
        target: config.extraData,
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
  if (name?.includes('Morpho')) {
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
    console.log('vaultSharePrice:', vaultSharePrice);

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
  console.log('Getting APY for chain:', chain);
  const { registry = FUTURE_REGISTRY_ADDRESS } = config[chain];
  console.log('Using registry:', registry);

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

    console.log('Found instances:', instances);

    // Debug only on the ith instance
    const i = 4;
    instances = instances.slice(i, i + 1);
    console.log('Debugging instance:', instances);

    const poolNames = (
      await sdk.api.abi.multiCall({
        abi: 'function name() view returns (string)',
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    console.log('Pool names:', poolNames);

    const poolConfig = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_CONFIG_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    // Get token addresses for price fetching
    const tokenAddresses = poolConfig.map(config => 
      config.vaultSharesToken === "0x0000000000000000000000000000000000000000" 
        ? config.baseToken 
        : config.vaultSharesToken
    );
    console.log('Token addresses to fetch prices for:', tokenAddresses);

    // Fetch prices for all tokens
    const priceKeys = tokenAddresses.map(addr => `${chain}:${addr}`);
    const pricesResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKeys.join(',')}`);
    const prices = pricesResponse.data.coins;
    console.log('Fetched token prices:', prices);

    const poolInfos = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_INFO_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const pools = poolNames.map((name, i) => ({ name, config: poolConfig[i], info: poolInfos[i], address: instances[i] }))
    console.log('Processing pools:', pools.map(p => ({ name: p.name, address: p.address })));

    const poolsData = await Promise.allSettled(
      pools.map(async (pool) => {
        try {
          console.log('Processing pool:', pool.name);

          const effective_share_reserves = pool.info.shareReserves - pool.info.shareAdjustment;
          const ratio = (pool.config.initialVaultSharePrice / 1e18 * effective_share_reserves) / pool.info.bondReserves;
          const spot_price = Math.pow(ratio, pool.config.timeStretch / 1e18);
          const time_stretch = pool.config.positionDuration / (365 * 24 * 60 * 60);
          const apr = (1 - spot_price) / (spot_price * time_stretch);
          console.log('APR calculation:', { effective_share_reserves, ratio, spot_price, time_stretch, apr });

          // time_stretch is in fractions of a year so we can use it to convert from apr to apy
          // compounding happens every time_stretch years, so we use discrete compounding formula
          const apy = Math.pow(1 + apr * time_stretch, 1/time_stretch) - 1;
          console.log('Calculated APY:', apy);

          const token_contract_address = pool.config.vaultSharesToken === ethers.constants.AddressZero ? pool.config.baseToken : pool.config.vaultSharesToken;
          const tokenKey = `${chain}:${token_contract_address}`;
          console.log('Looking up token:', { tokenKey, token_contract_address });

          const token_price = prices[tokenKey]?.price;
          const token_decimals = prices[tokenKey]?.decimals;
          const token_symbol = prices[tokenKey]?.symbol;
          console.log('Token info:', { token_price, token_decimals, token_symbol });

          if (!token_price || !token_decimals) {
            console.warn('Missing token info for', tokenKey);
            return null;
          }

          const vaultSharesBalance = await queryPoolHoldings(pool, pool.config, pool.name);
          console.log('Vault shares balance:', vaultSharesBalance);

          // in Hyperdrive, totalSupply and tvlUsd are the same because there is no borrowing
          let totalSupplyUsd = ((Number(vaultSharesBalance) || 0) / 10 ** token_decimals) * token_price;
          let tvlUsd = Number(totalSupplyUsd) || 0;
          let totalBorrowUsd = 0;
          console.log('TVL calculation:', { totalSupplyUsd, tvlUsd, totalBorrowUsd });

          const result = {
            pool: pool.name,
            chain,
            project: 'hyperdrive',
            symbol: token_symbol,
            tvlUsd,
            apy: apy * 100,
            apyBase: apy * 100,
            underlyingTokens: [token_contract_address],
            totalSupplyUsd,
            totalBorrowUsd,
            url: `app.hyperdrive.box/market/${providers[chain].chainId}/${pool.address}`
          };
          console.log('Pool result:', result);
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
  const pools = await Promise.allSettled(
    Object.keys(config).map(async (chain) => getApy(chain))
  );
  console.log('Pool results:', pools);

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => Boolean(p));
}

module.exports = {
  apy,
};
