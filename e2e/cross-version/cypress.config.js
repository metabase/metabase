const { defineConfig } = require("cypress");

const { defaultConfig } = require("../support/config");

const isDevMode = !!process.env.CROSS_VERSION_DEV_MODE;
const viewportWidth = 1600;
const viewportHeight = 1200;

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    specPattern: "e2e/cross-version/latest/**/*.cy.spec.ts",
    viewportWidth,
    viewportHeight,
    expose: {
      ...defaultConfig.expose,
      CROSS_VERSION_DEV_MODE: isDevMode,
    },
    setupNodeEvents(on, config) {
      // Call the default setupNodeEvents first
      defaultConfig.setupNodeEvents(on, config);

      // Set browser window size for headless mode to match viewport
      on("before:browser:launch", (browser, launchOptions) => {
        if (
          (browser.name === "chrome" || browser.name === "chromium") &&
          browser.isHeadless
        ) {
          launchOptions.args.push(
            `--window-size=${viewportWidth},${viewportHeight}`,
          );
        }

        if (browser.name === "electron" && browser.isHeadless) {
          launchOptions.preferences.width = viewportWidth;
          launchOptions.preferences.height = viewportHeight;
        }

        return launchOptions;
      });

      return config;
    },
  },
});
