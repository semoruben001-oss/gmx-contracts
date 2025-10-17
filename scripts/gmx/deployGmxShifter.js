const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
    const from = "0x6f4e8eba4d337f874ab57478acc2cb5bacdc19c9"
    const to = "0x02984c3BB35F0e61cFC690f221A5EBCc5389f86b"
    const gmx = "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"
    await deployContract("GmxShifter", [from, to, gmx])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
