const { defineConfig } = require("cypress");

const {
  stressTestConfig,
  embeddingSdkComponentTestConfig,
} = require("./config");

module.exports = defineConfig({
  e2e: stressTestConfig,
  component: { ...embeddingSdkComponentTestConfig, retries: 0 },
});
