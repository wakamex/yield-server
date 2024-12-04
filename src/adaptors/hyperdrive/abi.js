module.exports = {
    GET_POOL_CONFIG_ABI: {
        "inputs": [],
        "name": "getPoolConfig",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "address",
                        "name": "baseToken",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "vaultSharesToken",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "extraData",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct IHyperdrive.PoolConfig",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    GET_POOL_INFO_ABI: {
        "inputs": [],
        "name": "getPoolInfo",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "timeStretch",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "vaultSharePrice",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "baseApr",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct IHyperdrive.PoolInfo",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    POSITION_ABI: {
        "inputs": [],
        "name": "position",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "supplyShares",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct IHyperdrive.Position",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    MARKET_ABI: {
        "inputs": [],
        "name": "market",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "totalSupplyAssets",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "totalSupplyShares",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "virtualSupplyAssets",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "virtualSupplyShares",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct IHyperdrive.Market",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
};