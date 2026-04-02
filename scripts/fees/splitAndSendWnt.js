const prompts = require("prompts");
const hre = require("hardhat");
const { formatAmount } = require("../../test/shared/utilities");
const { writeToSheet } = require("./googleExport");
const {sendTxn} = require("../shared/helpers");

const shouldWrite = process.env.WRITE === "true";
const amountInput = process.env.AMOUNT;

const safeAddress = "0x729D09932cc56934DBE4E3cB2ab8BbF657dE1609";
const treasuryAddress = "0xea8a734db4c7EA50C32B5db8a0Cb811707e8ACE3";
const chainlinkAddress = "0x376F7ED693f608988B10409D9D810aCAe62d787c";

const SAFE_WEIGHT = 270; // 27.0
const TREASURY_WEIGHT = 88; // 8.8
const CHAINLINK_WEIGHT = 12; // 1.2
const TOTAL_WEIGHT = SAFE_WEIGHT + TREASURY_WEIGHT + CHAINLINK_WEIGHT;
const BALANCE_DISTRIBUTION_FACTOR = 9500; // 95%

function getAmountToDistribute(amountInput, wntDecimals, balance) {
  if (amountInput) {
    return hre.ethers.utils.parseUnits(amountInput, wntDecimals);
  }
  return balance.mul(BALANCE_DISTRIBUTION_FACTOR).div(10000);
}

async function main() {
  const [signer] = await hre.ethers.getSigners();

  const wntTokenInfo = require("../core/tokens")["arbitrum"].nativeToken;

  const wnt = await hre.ethers.getContractAt(
    "ERC20",
    wntTokenInfo.address,
    signer
  );

  const balance = await wnt.balanceOf(signer.address);
  const amount = getAmountToDistribute(amountInput, wntTokenInfo.decimals, balance);

  if (amount.lte(0)) {
    throw new Error("amount should be greater than 0");
  }

  if (amount.gt(balance)) {
    throw new Error(
      `insufficient WNT balance: amount ${formatAmount(amount, wntTokenInfo.decimals, 6, true)} > balance ${formatAmount(
        balance,
        wntTokenInfo.decimals,
        6,
        true
      )}`
    );
  }

  const safeAmount = amount.mul(SAFE_WEIGHT).div(TOTAL_WEIGHT);
  const treasuryAmount = amount.mul(TREASURY_WEIGHT).div(TOTAL_WEIGHT);
  const chainlinkAmount = amount.sub(safeAmount).sub(treasuryAmount);

  const distributedTotal = safeAmount.add(treasuryAmount).add(chainlinkAmount);
  if (!distributedTotal.eq(amount)) {
    throw new Error("distribution math mismatch");
  }

  console.log("network: %s", hre.network.name);
  console.log("signer: %s", signer.address);
  console.log("WNT: %s", wnt.address);
  console.log("wallet balance: %s", formatAmount(balance, wntTokenInfo.decimals, 6, true));
  console.log("amount to distribute: %s", formatAmount(amount, wntTokenInfo.decimals, 6, true));
  console.log("split ratio (safe:treasury:chainlink): 27:8.8:1.2");
  console.log("safe      %s -> %s", safeAddress, formatAmount(safeAmount, wntTokenInfo.decimals, 6, true));
  console.log("treasury  %s -> %s", treasuryAddress, formatAmount(treasuryAmount, wntTokenInfo.decimals, 6, true));
  console.log("chainlink %s -> %s", chainlinkAddress, formatAmount(chainlinkAmount, wntTokenInfo.decimals, 6, true));

  if (!shouldWrite) {
    const simulationSigner = wnt.callStatic;
    await simulationSigner.transfer(safeAddress, safeAmount);
    await simulationSigner.transfer(treasuryAddress, treasuryAmount);
    await simulationSigner.transfer(chainlinkAddress, chainlinkAmount);
    console.log("simulation ok. run with WRITE=true to send transactions");
    return;
  }

  const { proceed } = await prompts({
    type: "confirm",
    name: "proceed",
    message: "Send 3 WNT transfers now?",
    initial: false,
  });

  if (!proceed) {
    console.log("aborted");
    return;
  }

  const transfers = [
    { receiver: safeAddress, amount: safeAmount, name: "safe", tx: "" },
    { receiver: treasuryAddress, amount: treasuryAmount, name: "treasury", tx: "" },
    { receiver: chainlinkAddress, amount: chainlinkAmount, name: "chainlink", tx: "" },
  ];

  const baseNonce = await ethers.provider.getTransactionCount(signer.address);
  let i = 0;

  for (const transfer of transfers) {
    if (transfer.amount.eq(0)) {
      console.log("skip %s transfer: 0 amount", transfer.name);
      continue;
    }

    const tx = await sendTxn(
      wnt.transfer(transfer.receiver, transfer.amount, {
        nonce: baseNonce + i
      }),
      `wnt.transfer(${transfer.receiver}, ${formatAmount(transfer.amount, wntTokenInfo.decimals, 6, true)})`
    );
    i++;
    transfer.tx = tx.hash;
    console.log("%s tx confirmed", transfer.name);
  }

  const txes = transfers.reduce((acc, transfer) => {return acc + "\n" + transfer.tx }, '')
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-GB');
  await writeToSheet([
    [
    formattedDate,
    "Arbitrum",
    "WETH",
    formatAmount(amount, wntTokenInfo.decimals, 6, true),
    formatAmount(safeAmount, wntTokenInfo.decimals, 6, true),
    formatAmount(treasuryAmount, wntTokenInfo.decimals, 6, true),
    formatAmount(chainlinkAmount, wntTokenInfo.decimals, 6, true),
    txes
    ]
  ])
  console.log("done");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
