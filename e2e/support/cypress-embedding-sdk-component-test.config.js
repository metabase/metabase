import webpackConfig from "./component-webpack.config";
import { defaultConfig, mainConfig } from "./config";

const embeddingSdkComponentTestConfig = {
  ...defaultConfig,
  baseUrl: undefined, // baseUrl should not be set for component tests,
  defaultCommandTimeout: 10000,
  requestTimeout: 10000,
  video: false,
  specPattern: "e2e/test-component/scenarios/embedding-sdk/**/*.cy.spec.tsx",
  indexHtmlFile: "e2e/support/component-index.html",
  supportFile: "e2e/support/component-cypress.js",

  reporter: mainConfig.reporter,
  reporterOptions: mainConfig.reporterOptions,
  retries: mainConfig.retries,

  devServer: {
    framework: "react",
    bundler: "webpack",
    webpackConfig: webpackConfig,
  },
};

module.exports = {
  component: {
    ...embeddingSdkComponentTestConfig,
    baseUrl: undefined, // baseUrl is not a valid *component* config option,
  },
};
