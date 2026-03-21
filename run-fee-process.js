const { spawn } = require("child_process");

const child = spawn("npx", ["SKIP_VALIDATIONS=true", "hardhat", "run", "scripts/fees/runFeeProcess.js"], {
  cwd: __dirname,
});

child.stdout.on("data", (data) => {
  console.log(data.toString());
});

child.stderr.on("data", (data) => {
  console.error(data.toString());
});

child.on("close", (code) => {
  console.log(`Process exited with code ${code}`);
});
