module.exports = {
  apps: [
    {
      name: "fee-process",
      script: "./run-fee-process.js",
      cron_restart: "0 5 * * *",
      timezone: "UTC",
      autorestart: false,
      watch: false,
      interpreter: "/root/.nvm/versions/node/v22.21.1/bin/node"
    }
  ]
};
