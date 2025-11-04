require("dotenv").config();
const { ethers } = require("ethers");
const { StargateEVM, ChainIds } = require("@stargatefinance/stg-evm-sdk-v2");
const { sleep } = require("./helpers")

async function waitForTxn(txn) {
  if (network === "arbitrum") {
    await txn.wait(1)
  } else {
    await txn.wait(2)
  }
}

// TODO: use https://scan.layerzero-api.com/v1/swagger to query bridging status
async function waitForReceiptOnDesChain({ receiver, desRpcUrl }) {
  const provider = new ethers.JsonRpcProvider(desRpcUrl);
  const dstContract = new ethers.Contract(
    dstToken.address,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  const startBal = await dstContract.balanceOf(receiver);
  const timeoutMs = 600_000; // 10 minutes
  const intervalMs = 10_000; // 10s
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const newBal = await dstContract.balanceOf(receiver);
    if (newBal > startBal) {
      console.log(
        `GMX received on destination chain`
      );
      return;
    }
    process.stdout.write(".");
    await sleep(intervalMs)
  }

  throw new Error("GMX not received on destination chain")
}

async function bridge({ network, rpcUrl, desRpcUrl, key, srcChainName, desChainName, tokenAddress, desTokenAddress, receiver, amount }) {
  // --- wallet & provider ---
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(key, provider);

  // --- initialize Stargate SDK ---
  const stargate = new StargateEVM({ signer: wallet });

  // --- define chains ---
  const srcChain = ChainIds[srcChainName];
  const dstChain = ChainIds[desChainName];

  const token = {
    chainId: srcChain,
    address: tokenAddress,
    decimals: 18,
    symbol: "GMX",
    name: "GMX",
  };

  console.log("Fetching quote...");

  // --- quote route ---
  const quote = await stargate.quote({
    srcChain,
    dstChain,
    token,
    amount,
    slippageBps: 50, // 0.5 %
  });

  console.log("Quote:", quote);

  // --- approve if needed ---
  const allowance = await stargate.checkApproval(token, srcChain);
  if (allowance < amount) {
    const approveTx = await stargate.approve(token, srcChain, amount);
    if (network === "arbitrum") {
      await approveTx.wait(1)
    } else {
      await approveTx.wait(2)
    }
    console.log("Approved");
  }

  // --- execute bridge ---
  const tx = await stargate.transfer({
    srcChain,
    dstChain,
    token,
    amount,
    minAmountOut: quote.minAmountOut,
    receiver,
    route: quote.routeKey,
    fee: quote.fee,
  });

  console.log("Bridge TX hash:", tx.hash);
  await tx.wait();
  console.log("✅ Bridge complete");

  await waitForReceiptOnDesChain({ receiver })
}

main().catch(console.error);
