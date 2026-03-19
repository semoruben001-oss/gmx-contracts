const prompts = require("prompts");
const hre = require("hardhat");
const { formatAmount } = require("../../test/shared/utilities");
const MintableToken = require("../../artifacts-v2/contracts/mock/MintableToken.sol/MintableToken.json");
const {contractAt} = require("../shared/helpers");

const shouldWrite = process.env.WRITE === "true";
const amountInput = process.env.AMOUNT;

const safeAddress = "0x729D09932cc56934DBE4E3cB2ab8BbF657dE1609";
const treasuryAddress = "0xea8a734db4c7EA50C32B5db8a0Cb811707e8ACE3";
const chainlinkAddress = "0x376F7ED693f608988B10409D9D810aCAe62d787c";

const SAFE_WEIGHT = 270; // 27.0
const TREASURY_WEIGHT = 88; // 8.8
const CHAINLINK_WEIGHT = 12; // 1.2
const TOTAL_WEIGHT = SAFE_WEIGHT + TREASURY_WEIGHT + CHAINLINK_WEIGHT;

const {
  ARBITRUM_URL,
  AVAX_URL,
  HANDLER_KEY,
} = require("../../env.json");


const feeKeepers = {
  arbitrum: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.arbitrum),
  avax: new ethers.Wallet(FEE_KEEPER_KEY).connect(providers.avax),
};

const nativeTokens = {
  arbitrum: new ethers.Contract(
    require("../core/tokens")["arbitrum"].nativeToken.address,
    MintableToken.abi,
    feeKeepers.arbitrum
  ),

  avax: new ethers.Contract(
    require("../core/tokens")["avax"].nativeToken.address,
    MintableToken.abi,
    feeKeepers.avax
  ),
};

async function main() {
  const [signer] = await hre.ethers.getSigners();

  const wnt = await contractAt(
    "WETH",
    nativeTokens[network].address,
    signer
  );

  const balance = await wnt.balanceOf(signer.address);
  const amount = amountInput ? hre.ethers.utils.parseUnits(amountInput, wnt.decimals) : balance;

  if (amount.lte(0)) {
    throw new Error("amount should be greater than 0");
  }

  if (amount.gt(balance)) {
    throw new Error(
      `insufficient WNT balance: amount ${formatAmount(amount, wnt.decimals, 6, true)} > balance ${formatAmount(
        balance,
        wnt.decimals,
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
  console.log("wallet balance: %s", formatAmount(balance, wnt.decimals, 6, true));
  console.log("amount to distribute: %s", formatAmount(amount, wnt.decimals, 6, true));
  console.log("split ratio (safe:treasury:chainlink): 27:8.8:1.2");
  console.log("safe      %s -> %s", safeAddress, formatAmount(safeAmount, wnt.decimals, 6, true));
  console.log("treasury  %s -> %s", treasuryAddress, formatAmount(treasuryAmount, wnt.decimals, 6, true));
  console.log("chainlink %s -> %s", chainlinkAddress, formatAmount(chainlinkAmount, wnt.decimals, 6, true));

  if (!shouldWrite) {
    const simulationSigner = wntContract.callStatic;
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
    { receiver: safeAddress, amount: safeAmount, name: "safe" },
    { receiver: treasuryAddress, amount: treasuryAmount, name: "treasury" },
    { receiver: chainlinkAddress, amount: chainlinkAmount, name: "chainlink" },
  ];

  for (const transfer of transfers) {
    if (transfer.amount.eq(0)) {
      console.log("skip %s transfer: 0 amount", transfer.name);
      continue;
    }

    const tx = await wntContract.transfer(transfer.receiver, transfer.amount);
    console.log("%s tx sent: %s", transfer.name, tx.hash);
    await tx.wait();
    console.log("%s tx confirmed", transfer.name);
  }

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
