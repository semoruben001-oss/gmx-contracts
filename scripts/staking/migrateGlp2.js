const { contractAt, sendTxn } = require("../shared/helpers")

async function main() {
  const muchoMigrator = await contractAt("StakedGlpMigrator", "0xd18004a4113a33c524bacf547ACf3A3DFddcD1c1")
  await sendTxn(muchoMigrator.transfer("0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8", "75178648675533715840434"), "transfer")
}

main()
