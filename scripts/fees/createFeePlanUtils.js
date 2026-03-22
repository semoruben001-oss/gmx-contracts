const fs = require('fs')

const { Token: UniToken } = require("@uniswap/sdk-core")
const { Pool } = require("@uniswap/v3-sdk")

const { processPeriodV1, processPeriodV2, getPeriod } = require('../shared/stats');
const { getArbValues: getArbKeeperValues, getAvaxValues: getAvaxKeeperValues } = require("../shared/fundAccountsUtils")
const { expandDecimals, formatAmount, parseValue, bigNumberify } = require("../../test/shared/utilities")
const { ARBITRUM, signers, contractAt, sendPushMessage } = require("../shared/helpers")
const keys = require("../shared/keys")
let feePlan

try {
  feePlan = require("../../fee-plan.json");
} catch (err) {
  console.warn(err)
}

const {
  ARBITRUM_URL,
  AVAX_URL,
} = require("../../env.json");

const providers = {
  arbitrum: new ethers.providers.JsonRpcProvider(ARBITRUM_URL),
  avax: new ethers.providers.JsonRpcProvider(AVAX_URL)
}

const FEE_KEEPER = "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D"

if (FEE_KEEPER === undefined) {
  throw new Error(`FEE_KEEPER is not defined`)
}

const DataStore = require("../../artifacts-v2/contracts/data/DataStore.sol/DataStore.json")
const WETH = require("../../artifacts/contracts/tokens/WETH.sol/WETH.json")

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY
const DAILY_SENDING = true

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const ARB_MULTIPLIER = process.env.ARB_MULTIPLIER || 10000
const AVAX_MULTIPLIER = process.env.AVAX_MULTIPLIER || 10000

const SKIP_VALIDATIONS = process.env.SKIP_VALIDATIONS

const allTokens = require('../core/tokens')

async function getGmxPrice(ethPrice) {
  const uniPool = await contractAt("UniPool", "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E", signers.arbitrum)
  const uniPoolSlot0 = await uniPool.slot0()

  const tokenA = new UniToken(ARBITRUM, "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 18, "SYMBOL", "NAME");
  const tokenB = new UniToken(ARBITRUM, "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", 18, "SYMBOL", "NAME");

  const pool = new Pool(
    tokenA, // tokenA
    tokenB, // tokenB
    10000, // fee
    uniPoolSlot0.sqrtPriceX96, // sqrtRatioX96
    1, // liquidity
    uniPoolSlot0.tick, // tickCurrent
    []
  );

  const poolTokenPrice = pool.priceOf(tokenB).toSignificant(6);
  const poolTokenPriceAmount = parseValue(poolTokenPrice, 18);
  return poolTokenPriceAmount.mul(ethPrice).div(expandDecimals(1, 18));
}

function roundToNearestWeek(timestamp, dayOffset) {
  return parseInt(timestamp / MILLISECONDS_PER_WEEK) * MILLISECONDS_PER_WEEK + dayOffset * MILLISECONDS_PER_DAY
}

async function getInfoTokens(vault, reader, nativeToken, tokenArr) {
  const vaultTokenInfo = await reader.getVaultTokenInfo(
    vault.address,
    nativeToken.address,
    expandDecimals(1, 18),
    tokenArr.map(t => t.address)
  )
  console.log("tokenArr.length", tokenArr.length)
  console.log("vaultTokenInfo.length", vaultTokenInfo.length)
  console.log("vaultTokenInfo", vaultTokenInfo)
  const infoTokens = {}
  const vaultPropsLength = 10

  for (let i = 0; i < tokenArr.length; i++) {
    // console.log("parsing", tokenArr[i])
    const token = JSON.parse(JSON.stringify(tokenArr[i]))

    // console.log("vaultTokenInfo", i * vaultPropsLength)
    token.poolAmount = vaultTokenInfo[i * vaultPropsLength]
    token.reservedAmount = vaultTokenInfo[i * vaultPropsLength + 1]
    token.usdgAmount = vaultTokenInfo[i * vaultPropsLength + 2]
    token.redemptionAmount = vaultTokenInfo[i * vaultPropsLength + 3]
    token.weight = vaultTokenInfo[i * vaultPropsLength + 4]
    token.minPrice = vaultTokenInfo[i * vaultPropsLength + 5]
    token.maxPrice = vaultTokenInfo[i * vaultPropsLength + 6]
    token.guaranteedUsd = vaultTokenInfo[i * vaultPropsLength + 7]
    token.maxPrimaryPrice = vaultTokenInfo[i * vaultPropsLength + 8]
    token.minPrimaryPrice = vaultTokenInfo[i * vaultPropsLength + 9]
    // console.log("token", token)

    infoTokens[token.address] = token
  }

  return infoTokens
}

async function getArbFeeValues() {
  const signer = signers.arbitrum
  const dataStore = new ethers.Contract("0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", DataStore.abi, providers.arbitrum)
  const vault = await contractAt("Vault", "0x489ee077994B6658eAfA855C308275EAd8097C4A", signer)
  const reader = await contractAt("Reader", "0x2b43c90D1B727cEe1Df34925bcd5Ace52Ec37694", signer)
  const gmx = await contractAt("GMX", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", signer)

  const tokens = allTokens.arbitrum
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)
  const tokenInfo = await getInfoTokens(vault, reader, tokens.nativeToken, [tokens.nativeToken])
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(withdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  let feeKeeperGmxBalance = bigNumberify(0)
  let feeKeeperNativeTokenBalance = bigNumberify(0)

  // if (process.env.INCLUDE_FEE_KEEPER_BALANCE === "true") {
  //   feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  //   feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)
  // }

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)
  console.log("arb totalGmxBalance", totalGmxBalance.toString())
  console.log("arb totalNativeTokenBalance", totalNativeTokenBalance.toString())

  const stakedGmx = await contractAt("Token", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()

  const { totalTransferAmount: keeperCosts } = await getArbKeeperValues()
  console.log("createFeePlan arb keeperCosts", keeperCosts.toString())

  return {
    nativeTokenPrice,
    totalGmxBalance,
    totalNativeTokenBalance,
    stakedGmxSupply,
    keeperCosts
  }
}

async function getAvaxFeeValues() {
  const signer = signers.avax
  const dataStore = new ethers.Contract("0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6", DataStore.abi, providers.avax)
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595", signer)
  const reader = await contractAt("Reader", "0x2eFEE1950ededC65De687b40Fd30a7B5f4544aBd", signer)
  const gmx = await contractAt("GMX", "0x62edc0692BD897D2295872a9FFCac5425011c661", signer)

  const tokens = allTokens.avax
  const nativeToken = await contractAt("Token", tokens.nativeToken.address, signer)
  const tokenInfo = await getInfoTokens(vault, reader, tokens.nativeToken, [tokens.nativeToken])
  const nativeTokenPrice = tokenInfo[tokens.nativeToken.address].maxPrice

  const withdrawableGmxAmountKey = keys.withdrawableBuybackTokenAmountKey(gmx.address)
  const withdrawableGmx = await dataStore.getUint(withdrawableGmxAmountKey)

  const withdrawableNativeTokenAmountKey = keys.withdrawableBuybackTokenAmountKey(tokens.nativeToken.address)
  const withdrawableNativeToken = await dataStore.getUint(withdrawableNativeTokenAmountKey)

  let feeKeeperGmxBalance = bigNumberify(0)
  let feeKeeperNativeTokenBalance = bigNumberify(0)

  // if (process.env.INCLUDE_FEE_KEEPER_BALANCE === "true") {
  //   feeKeeperGmxBalance = await gmx.balanceOf(FEE_KEEPER)
  //   feeKeeperNativeTokenBalance = await nativeToken.balanceOf(FEE_KEEPER)
  // }

  const totalGmxBalance = withdrawableGmx.add(feeKeeperGmxBalance)
  const totalNativeTokenBalance = withdrawableNativeToken.add(feeKeeperNativeTokenBalance)

  console.log("avax totalGmxBalance", totalGmxBalance.toString())
  console.log("avax totalNativeTokenBalance", totalNativeTokenBalance.toString())

  const stakedGmx = await contractAt("Token", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13", signer)
  const stakedGmxSupply = await stakedGmx.totalSupply()

  const { totalTransferAmount: keeperCosts } = await getAvaxKeeperValues()
  console.log("createFeePlan avax keeperCosts", keeperCosts.toString())

  return {
    nativeTokenPrice,
    totalGmxBalance,
    totalNativeTokenBalance,
    stakedGmxSupply,
    keeperCosts
  }
}

async function getFeeValues() {
  const values = {
      arbitrum: await getArbFeeValues(),
      avax: await getAvaxFeeValues()
  }

  const gmxPrice = await getGmxPrice(values.arbitrum.nativeTokenPrice)

  return {
    ...values,
    gmxPrice
  }
}

function startOfTodayUTC() {
  const now = new Date()
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
}

function getRefTime() {
  let refTimestamp;
  let refDate;
  if (DAILY_SENDING) {
    refTimestamp = startOfTodayUTC();
    refDate = new Date(refTimestamp)
  } else {
    refTimestamp = roundToNearestWeek(Date.now(), 6)
    refDate = new Date(refTimestamp)

    const dayName = DAY_NAMES[refDate.getDay()]
    if (dayName !== "Wednesday") {
      throw new Error(`unexpected day: ${dayName}`)
    }
  }

  if (SKIP_VALIDATIONS !== "true" && refTimestamp > Date.now()) {
    throw new Error(`refTimestamp is later than current time ${refTimestamp}`)
  }

  const allowedDelay = 24 * 60 * 60 * 1000 // 24 hrs
  if (refTimestamp < Date.now() - allowedDelay) {
    throw new Error(`refTimestamp is older than the allowed delay`)
  }

  return { refTimestamp, refDate }
}

async function saveFeePlan({ feeValues, refTimestamp }) {
  const values = feeValues

  const totalWethAvailable = values.arbitrum.totalNativeTokenBalance
  let treasuryWethAmount = totalWethAvailable.mul(88).div(100).mul(ARB_MULTIPLIER).div(10000)
  const chainlinkWethAmount = totalWethAvailable.mul(12).div(100)

  console.log("totalWethAvailable", totalWethAvailable.toString())
  console.log("treasuryWethAmount", treasuryWethAmount.toString())
  console.log("chainlinkWethAmount", chainlinkWethAmount.toString())

  const keeperCostsWeth = values.arbitrum.keeperCosts
  console.log("keeperCostsWeth", keeperCostsWeth.toString())

  if (keeperCostsWeth.gt(treasuryWethAmount)) {
    await sendPushMessage(`Insufficient WETH for keeper top ups, keeper costs: ${formatAmount(keeperCostsWeth, 18, 4, true)}, treasury fees for the week: ${formatAmount(treasuryWethAmount, 18, 4, true)}`)
    treasuryWethAmount = bigNumberify(0)
  } else {
    treasuryWethAmount = treasuryWethAmount.sub(keeperCostsWeth)
  }

  console.log("adjusted treasuryWethAmount", treasuryWethAmount.toString())

  const totalWavaxAvailable = values.avax.totalNativeTokenBalance
  let treasuryWavaxAmount = totalWavaxAvailable.mul(88).div(100).mul(AVAX_MULTIPLIER).div(10000)
  const chainlinkWavaxAmount = totalWavaxAvailable.mul(12).div(100)

  console.log("totalWavaxAvailable", totalWavaxAvailable.toString())
  console.log("treasuryWavaxAmount", treasuryWavaxAmount.toString())
  console.log("chainlinkWavaxAmount", chainlinkWavaxAmount.toString())

  const keeperCostsWavax = values.avax.keeperCosts
  console.log("keeperCostsWavax", keeperCostsWavax.toString())

  if (keeperCostsWavax.gt(treasuryWavaxAmount)) {
    await sendPushMessage(`Insufficient WAVAX for keeper top ups, keeper costs: ${formatAmount(keeperCostsWavax, 18, 4, true)}, treasury fees for the week: ${formatAmount(treasuryWavaxAmount, 18, 4, true)}`)
    treasuryWavaxAmount = bigNumberify(0)
  } else {
    treasuryWavaxAmount = treasuryWavaxAmount.sub(keeperCostsWavax)
  }

  const totalArbGmxAvailable = values.arbitrum.totalGmxBalance
  const totalAvaxGmxAvailable = values.avax.totalGmxBalance

  const arbStaked = values.arbitrum.stakedGmxSupply
  const avaxStaked = values.avax.stakedGmxSupply
  const totalStaked = arbStaked.add(avaxStaked)

  const totalGmxAvailable = totalArbGmxAvailable.add(totalAvaxGmxAvailable)
  let requiredAvaxGmxRewards = totalGmxAvailable.mul(avaxStaked).div(totalStaked)
  let requiredArbGmxRewards = totalGmxAvailable.sub(requiredAvaxGmxRewards)

  // add a multiplier to allow for some buffer to ensure the ExtendedGmxDistributor
  // does not run out of funds
  let gmxMultiplier = process.env.GMX_MULTIPLIER ? process.env.GMX_MULTIPLIER : 100

  requiredAvaxGmxRewards = requiredAvaxGmxRewards.mul(gmxMultiplier).div(100)
  requiredArbGmxRewards = requiredArbGmxRewards.mul(gmxMultiplier).div(100)

  const deltaRewardsArb = totalArbGmxAvailable.sub(requiredArbGmxRewards)
  const amountToBridge = deltaRewardsArb.abs()
  let amountToBridgeFromArbritrum = bigNumberify(0)
  let amountToBridgeFromAvalanche = bigNumberify(0)

  if (deltaRewardsArb.gt(0)) {
    amountToBridgeFromArbritrum = amountToBridge
  }

  if (deltaRewardsArb.lt(0)) {
    amountToBridgeFromAvalanche = amountToBridge
  }

  const data = {
    nativeTokenBalance: {
      arbitrum: totalWethAvailable.toString(),
      avax: totalWavaxAvailable.toString(),
    },
    gmxTokenBalance: {
      arbitrum: values.arbitrum.totalGmxBalance.toString(),
      avax: values.avax.totalGmxBalance.toString(),
    },
    treasuryFees: {
      arbitrum: treasuryWethAmount.toString(),
      avax: treasuryWavaxAmount.toString()
    },
    chainlinkFees: {
      arbitrum: chainlinkWethAmount.toString(),
      avax: chainlinkWavaxAmount.toString()
    },
    keeperCosts: {
      arbitrum: keeperCostsWeth.toString(),
      avax: keeperCostsWavax.toString()
    },
    gmxRewards: {
      arbitrum: requiredArbGmxRewards.toString(),
      avax: requiredAvaxGmxRewards.toString()
    },
    nativeTokenPrice: {
      arbitrum: values.arbitrum.nativeTokenPrice.toString(),
      avax: values.avax.nativeTokenPrice.toString(),
    },
    gmxPrice: values.gmxPrice.toString(),
    refTimestamp: refTimestamp,
    deltaRewardArb: deltaRewardsArb.toString(),
    amountToBridge: amountToBridge.toString(),
    amountToBridgeFromArbritrum: amountToBridgeFromArbritrum.toString(),
    amountToBridgeFromAvalanche: amountToBridgeFromAvalanche.toString(),
  }

  const expectedNativeTokenBalance = {
    arbitrum: bigNumberify(data.treasuryFees.arbitrum)
      .add(data.chainlinkFees.arbitrum),

    avax: bigNumberify(data.treasuryFees.avax)
      .add(data.chainlinkFees.avax),
  }

  const expectedGmxTokenBalance = bigNumberify(data.gmxRewards.arbitrum).add(data.gmxRewards.avax)

  if (bigNumberify(data.nativeTokenBalance.arbitrum).lt(expectedNativeTokenBalance.arbitrum)) {
    throw new Error(`Insufficient nativeTokenBalance.arbitrum: ${data.nativeTokenBalance.arbitrum}, ${expectedNativeTokenBalance.arbitrum.toString()}`)
  }

  if (bigNumberify(data.nativeTokenBalance.avax).lt(expectedNativeTokenBalance.avax)) {
    throw new Error(`Insufficient nativeTokenBalance.avax: ${data.nativeTokenBalance.avax}, ${expectedNativeTokenBalance.avax.toString()}`)
  }

  if (bigNumberify(data.gmxTokenBalance.arbitrum).add(data.gmxTokenBalance.avax).lt(expectedGmxTokenBalance)) {
    throw new Error(`Insufficient gmxTokenBalance: ${bigNumberify(data.gmxTokenBalance.arbitrum).add(data.gmxTokenBalance.avax).toString()}, ${expectedGmxTokenBalance.toString()}`)
  }

  console.info("data", data)

  if (deltaRewardsArb.gt(0)) {
    console.info(`Bridge ${formatAmount(amountToBridge, 18, 4, true)} GMX from Arbitrum to Avalanche to equalize APRs`)
  } else if (deltaRewardsArb.lt(0)) {
    console.info(`Bridge ${formatAmount(amountToBridge, 18, 4, true)} GMX from Avalanche to Arbitrum to equalize APRs`)
  } else {
    console.info('No bridging needed. APRs are already equal')
  }

  console.info(`ETH price: $${formatAmount(data.nativeTokenPrice.arbitrum, 30, 2, true)}`)
  console.info(`AVAX price: $${formatAmount(data.nativeTokenPrice.avax, 30, 2, true)}`)

  // more console logs to be added

  const filename = `./fee-plan.json`
  fs.writeFileSync(filename, JSON.stringify(data, null, 4))
}

async function createFeePlan() {
  const { refTimestamp } = getRefTime()
  console.log(`refTimestamp: ${refTimestamp}`);

  if (feePlan && (refTimestamp - feePlan.refTimestamp) < 86400) {
    console.log("Fee plan for day already exists")
    return
    // throw new Error("Fee plan for week already exists")
  }

  const feeValues = await getFeeValues()
  console.log("feeValues", feeValues)
  console.log("feeValues.gmxPrice", feeValues.gmxPrice.toString())

  await saveFeePlan({ feeValues, refTimestamp })
  // await sendPushMessage("Step 0: Fee Plan Created")
}

module.exports = { createFeePlan };
