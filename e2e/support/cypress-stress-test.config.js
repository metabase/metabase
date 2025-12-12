const { defineConfig } = require("cypress");

const { defaultConfig, embeddingSdkComponentTestConfig } = require("./config");

module.exports = defineConfig({
  e2e: { ...defaultConfig, retries: 0 },
  component: { ...embeddingSdkComponentTestConfig, retries: 0 },
});
