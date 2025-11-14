const bs58 = require('bs58')
const { hexZeroPad } = require('@ethersproject/bytes')
const { BigNumber } = require('ethers')
const { parseUnits } = require('ethers/lib/utils')

const { ChainType, endpointIdToChainType, endpointIdToNetwork } = require('@layerzerolabs/lz-definitions')
const { waitForTxn } = require("./helpers")

const layerzeroConfig = require('./layerzero')
const ERC20MinimalABI = require('../../abi/ERC20Minimal.json')
const IOFTArtifact = require('../../abi/IOFT.json')

const makeBytes32 = (bytes) => hexZeroPad(bytes || '0x0', 32)

async function sendEvm(
  { rpcUrl, key, srcWrapperAddress, srcEid, dstEid, amount, to, minAmount, extraOptions, composeMsg },
  hre
) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(key).connect(provider)

  // 2️⃣ load IOFT ABI
  // Use the minimal IOFT ABI with only the functions we need: token(), approvalRequired(), quoteSend(), send()
  const oft = new ethers.Contract(srcWrapperAddress, IOFTArtifact, signer)

  // 3️⃣ get underlying token address and create ERC20 contract
  let tokenAddress
  let decimals
  let erc20Contract = null

  try {
    // Try to get token address (for adapters)
    tokenAddress = await oft.token()
    erc20Contract = new ethers.Contract(tokenAddress, ERC20MinimalABI, signer)
    decimals = await erc20Contract.decimals()
    console.info(`Found underlying token: ${tokenAddress} with ${decimals} decimals`)
  } catch (error) {
    // Fallback for native OFT or if token() doesn't exist
    decimals = 18
    console.info(`Using fallback decimals: ${decimals}`)
  }

  // 5️⃣ handle token approval if needed
  if (erc20Contract && tokenAddress) {
    const approveTx = await erc20Contract.connect(signer).approve(srcWrapperAddress, amount)
    await waitForTxn(approveTx)
    console.info(`Approved ${amount} tokens for ${srcWrapperAddress}`)
  }

  // Decide how to encode `to` based on target chain:
  const dstChain = endpointIdToChainType(dstEid)
  let toBytes
  if (dstChain === ChainType.SOLANA) {
    // Base58→32-byte buffer
    toBytes = makeBytes32(bs58.decode(to))
  } else {
    // hex string → Uint8Array → zero-pad to 32 bytes
    toBytes = makeBytes32(to)
  }

  // 6️⃣ build sendParam and dispatch
  const sendParam = {
    dstEid,
    to: toBytes,
    amountLD: amount.toString(),
    minAmountLD: minAmount,
    extraOptions: extraOptions ? extraOptions.toString() : '0x',
    composeMsg: composeMsg ? composeMsg.toString() : '0x',
    oftCmd: '0x',
  }

  // 6️⃣ Quote (MessagingFee = { nativeFee, lzTokenFee })
  console.info('Quoting the native gas cost for the send transaction...')
  let msgFee
  try {
    msgFee = await oft.quoteSend(sendParam, false)
  } catch (error) {
    throw error
  }

  console.info('Sending the transaction...')
  let tx
  try {
    // Connect signer and send transaction
    const oftWithSigner = oft.connect(signer)
    tx = await oftWithSigner.send(sendParam, msgFee, signer.address, {
      value: msgFee.nativeFee,
    })
  } catch (error) {
    throw error
  }

  await waitForTxn(tx)
  console.log(`sent txn: ${tx.hash}`)

  return { txnHash: tx.hash }
}

module.exports = {
  sendEvm,
}
