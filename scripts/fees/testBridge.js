const { sendEvm } = require("../shared/bridge")

const {
  ARBITRUM_URL,
  AVAX_URL,
  HANDLER_KEY,
} = require("../../env.json");

async function main() {
  console.log("HANDLER_KEY", HANDLER_KEY)
  await sendEvm({
    rpcUrl: ARBITRUM_URL,
    key: HANDLER_KEY,
    srcWrapperAddress: "0x02984c3BB35F0e61cFC690f221A5EBCc5389f86b",
    srcEid: "30110",
    dstEid: "30106",
    amount: "1000000000000000000",
    to: "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D",
    minAmount: "1000000000000000000"
  })
}

main()
