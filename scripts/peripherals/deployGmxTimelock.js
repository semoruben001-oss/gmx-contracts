const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const { AddressZero } = ethers.constants

async function runForArbitrum() {
  const admin = "0x2c247a44928d66041D9F7B11A69d7a84d25207ba"
  const rewardManager = { address: AddressZero }
  const buffer = 24 * 60 * 60
  const longBuffer = 7 * 24 * 60 * 60
  const tokenManager = { address: "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E" }
  const mintReceiver = { address: AddressZero }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const timelock = await deployContract("GmxTimelock", [
    admin,
    buffer,
    longBuffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply
  ], "GmxTimelock", { gasLimit: 100000000 })
}

async function runForAvax() {
  const admin = "0x9bf98C09590CeE2Ec5F6256449754f1ba77d5aE5"
  const rewardManager = { address: ethers.constants.AddressZero }
  const buffer = 24 * 60 * 60
  const longBuffer = 7 * 24 * 60 * 60
  const tokenManager = { address: "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D" }
  const mintReceiver = { address: AddressZero }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const timelock = await deployContract("GmxTimelock", [
    admin,
    buffer,
    longBuffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply
  ])
}

async function main() {
  if (network === "avax") {
    await runForAvax()
  } else {
    await runForArbitrum()
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
