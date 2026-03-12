const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");
const {
  component: embeddingSdkComponentTestConfig,
} = require("./cypress-embedding-sdk-component-test.config");

module.exports = defineConfig({
  e2e: { ...defaultConfig, retries: 0 },
  component: { ...embeddingSdkComponentTestConfig, retries: 0 },
});
