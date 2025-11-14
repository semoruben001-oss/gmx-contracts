const { EndpointId } = require('@layerzerolabs/lz-definitions')
const { ExecutorOptionType } = require('@layerzerolabs/lz-v2-utilities')
const { generateConnectionsConfig } = require('@layerzerolabs/metadata-tools')

// Note:  Do not use address for EVM contracts. Contracts are loaded using hardhat-deploy.
// If you do use an address, ensure artifacts exists.
const arbitrumContract = {
    eid: EndpointId.ARBITRUM_V2_MAINNET,
    contractName: 'GMX_LockboxAdapter',
}

const avalancheContract = {
    eid: EndpointId.AVALANCHE_V2_MAINNET,
    contractName: 'GMX_MintBurnAdapter',
}

const EVM_ENFORCED_OPTIONS = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 80_000,
        value: 0,
    },
]

const CU_LIMIT = 200000 // This represents the CU limit for executing the `lz_receive` function on Solana.
const SPL_TOKEN_ACCOUNT_RENT_VALUE = 2_039_280 // 2039280 lamports = 0.00203928 SOL

const BlockConfirmations = {
    [EndpointId.ARBITRUM_V2_MAINNET]: 20,
    [EndpointId.AVALANCHE_V2_MAINNET]: 12,
}

const DVNs = [
    ['LayerZero Labs', 'Canary'], // Required DVNs
    [['Deutsche Telekom', 'Horizen'], 1], // Optional DVNs, threshold
]

// Learn about Message Execution Options: https://docs.layerzero.network/v2/developers/solana/oft/account#message-execution-options
// Learn more about the Simple Config Generator - https://docs.layerzero.network/v2/developers/evm/technical-reference/simple-config
module.exports = async function () {
    // note: pathways declared here are automatically bidirectional
    // if you declare A,B there's no need to declare B,A
    const connections = await generateConnectionsConfig([
        [
            arbitrumContract, // Chain A contract
            avalancheContract, // Chain B contract
            DVNs,
            [
                BlockConfirmations[EndpointId.ARBITRUM_V2_MAINNET],
                BlockConfirmations[EndpointId.AVALANCHE_V2_MAINNET],
            ], // [A to B confirmations, B to A confirmations]
            [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS], // Chain B enforcedOptions, Chain A enforcedOptions
        ],
    ])

    const contracts = [
        {
            contract: arbitrumContract,
            config: {
                owner: '0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D',
                delegate: '0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D',
            },
        },
        {
            contract: avalancheContract,
            config: {
                owner: '0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D',
                delegate: '0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D',
            },
        },
    ]

    return {
        contracts,
        connections,
    }
}
