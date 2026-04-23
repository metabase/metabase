const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");
const {
  component: embeddingSdkComponentTestConfig,
} = require("./cypress-embedding-sdk-component-test.config");

const isFailFastEnabled = process.env.FAIL_FAST === "true";

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    expose: {
      ...defaultConfig.expose,
      FAIL_FAST: isFailFastEnabled,
    },
    retries: 0,
    videoCompression: false,
  },
  component: {
    ...embeddingSdkComponentTestConfig,
    expose: {
      ...embeddingSdkComponentTestConfig.expose,
      FAIL_FAST: isFailFastEnabled,
    },
    retries: 0,
    videoCompression: false,
  },
});
