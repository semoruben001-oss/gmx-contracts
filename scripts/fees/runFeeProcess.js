const { createFeePlan } = require("./createFeePlanUtils")
const { distributeFees } = require("./distributeFees")
const { sendPushMessage } = require("../shared/helpers");

async function main() {
  await sendPushMessage("running fee process")
  await createFeePlan()
  await distributeFees({ steps: "1,2,3,4,5,6" })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
