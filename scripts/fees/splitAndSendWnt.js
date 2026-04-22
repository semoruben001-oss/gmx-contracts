const {splitAndDistributeWnt} = require("./sendWntUtils");

async function main() {
  await splitAndDistributeWnt(true /*isManual*/);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
