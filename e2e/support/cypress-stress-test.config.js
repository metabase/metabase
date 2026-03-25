const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");
const {
  component: embeddingSdkComponentTestConfig,
} = require("./cypress-embedding-sdk-component-test.config");

const bail = process.env.BAIL === "true" ? 1 : 0;

module.exports = defineConfig({
  e2e: { ...defaultConfig, retries: 0, bail },
  component: { ...embeddingSdkComponentTestConfig, retries: 0, bail },
});
