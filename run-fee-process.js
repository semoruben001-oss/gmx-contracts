const { exec } = require("child_process");

exec(
  "npx hardhat run scripts/fees/runFeeProcess.js",
  { cwd: __dirname },
  (err, stdout, stderr) => {
    if (err) {
      console.error("Execution error:", err);
      return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
  }
);
