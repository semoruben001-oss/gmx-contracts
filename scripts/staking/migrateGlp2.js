const { contractAt, sendTxn } = require("../shared/helpers")

async function main() {
  const receiver = "0xf8625242FC03cc947CfEeDfB2d7346780C9E320f"

  const archiMigrator1 = await contractAt("StakedGlpMigrator", "0x2A1d1e96608278E7aE6403CfC3dbbB4931ddeFF8")
  const archiMigrator2 = await contractAt("StakedGlpMigrator", "0x5960cF081Cc53879b94478C61545eB9a56720667")

  const archiClaimer1 = await contractAt("RewardClaimer", "0xDde929d971e3d4970557864b65768d622AC67d2C")
  const archiClaimer2 = await contractAt("RewardClaimer", "0xbFBC997ec0C3bA8bDFd6cd2F38275554eE7c307C")

  // await sendTxn(archiMigrator1.transfer(receiver, "8478669565000000000000"), "transfer 1")
  // await sendTxn(archiMigrator2.transfer(receiver, "1606694316608562497521215"), "transfer 2")
  await sendTxn(archiClaimer1.claim(receiver), "claim 1")
  await sendTxn(archiClaimer2.claim(receiver), "claim 2")
}

main()
