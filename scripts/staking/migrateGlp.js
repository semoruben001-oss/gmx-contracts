const { contractAt, sendTxn } = require("../shared/helpers")
const { signExternally } = require("../shared/signer")

async function main() {
  const timelock = await contractAt("Timelock", "0x460e1A727c9CAE785314994D54bde0804582bc6e")

  const stakedGlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const feeGlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")

  const muchoMigrator = await contractAt("StakedGlpMigrator", "0xd18004a4113a33c524bacf547ACf3A3DFddcD1c1")
  const archiMigrator1 = await contractAt("StakedGlpMigrator", "0x2A1d1e96608278E7aE6403CfC3dbbB4931ddeFF8")
  const archiMigrator2 = await contractAt("StakedGlpMigrator", "0x5960cF081Cc53879b94478C61545eB9a56720667")

  const archiClaimer1 = await contractAt("StakedGlpMigrator", "0xDde929d971e3d4970557864b65768d622AC67d2C")
  const archiClaimer2 = await contractAt("StakedGlpMigrator", "0xbFBC997ec0C3bA8bDFd6cd2F38275554eE7c307C")

  const multicallWriteParams = [
    timelock.interface.encodeFunctionData("setHandler", [stakedGlpTracker.address, muchoMigrator.address, true]),
    timelock.interface.encodeFunctionData("setHandler", [feeGlpTracker.address, muchoMigrator.address, true]),

    timelock.interface.encodeFunctionData("setHandler", [stakedGlpTracker.address, archiMigrator1.address, true]),
    timelock.interface.encodeFunctionData("setHandler", [feeGlpTracker.address, archiMigrator1.address, true]),

    timelock.interface.encodeFunctionData("setHandler", [stakedGlpTracker.address, archiMigrator2.address, true]),
    timelock.interface.encodeFunctionData("setHandler", [feeGlpTracker.address, archiMigrator2.address, true]),

    timelock.interface.encodeFunctionData("setHandler", [feeGlpTracker.address, archiClaimer1.address, true]),
    timelock.interface.encodeFunctionData("setHandler", [feeGlpTracker.address, archiClaimer2.address, true])
  ]

  await signExternally(await timelock.populateTransaction.multicall(multicallWriteParams));
}

main()
