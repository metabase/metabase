const cypress = require("cypress");

const { parseArguments, args } = require("./cypress-runner-utils");

const DEFAULT_PORT = 4000;
const getHost = ({ port } = { port: null }) =>
  `http://localhost:${port ?? process.env.BACKEND_PORT ?? DEFAULT_PORT}`;

// This is a map of all possible Cypress configurations we can run.
const configs = {
  e2e: async () => {
    const defaultConfig = {
      browser: "chrome",
      configFile: "e2e/support/cypress.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);
    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  "metabase-nodejs-react-sdk-embedding-sample-e2e": async () => {
    const clientPort = 3100;

    const defaultConfig = {
      browser: "chrome",
      configFile: "support/cypress.config.js",
      config: {
        baseUrl: getHost({ port: clientPort }),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);
    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  "metabase-nextjs-sdk-embedding-sample-app-router-e2e": async () => {
    const sampleAppName = "metabase-nextjs-sdk-embedding-sample";
    const clientPort = 4401;

    const defaultConfig = {
      browser: "chrome",
      project: `e2e/tmp/${sampleAppName}/next-sample-app-router/e2e`,
      configFile: "support/cypress.config.js",
      config: {
        baseUrl: getHost({ port: clientPort }),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);
    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  "metabase-nextjs-sdk-embedding-sample-pages-router-e2e": async () => {
    const sampleAppName = "metabase-nextjs-sdk-embedding-sample";
    const clientPort = 4401;

    const defaultConfig = {
      browser: "chrome",
      project: `e2e/tmp/${sampleAppName}/next-sample-pages-router/e2e`,
      configFile: "support/cypress.config.js",
      config: {
        baseUrl: getHost({ port: clientPort }),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);
    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  "shoppy-e2e": async () => {
    const sampleAppName = "shoppy";
    const clientPort = 4403;

    const defaultConfig = {
      browser: "chrome",
      project: `e2e/tmp/${sampleAppName}/e2e`,
      configFile: "support/cypress.config.js",
      config: {
        baseUrl: getHost({ port: clientPort }),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);
    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  snapshot: async () => {
    // We only ever care about a browser out of all possible user arguments,
    // when it comes to the snapshot generation.
    // Anything else could result either in a failure or in a wrong database snapshot!
    const { browser } = await parseArguments(args);

    const snapshotConfig = {
      browser: browser ?? "chrome",
      configFile: "e2e/support/cypress-snapshots.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: false,
    };

    return snapshotConfig;
  },
  component: async () => {
    const { browser } = await parseArguments(args);

    const sdkComponentConfig = {
      browser: browser ?? "chrome",
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "component",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    return sdkComponentConfig;
  },
};

/**
 * This simply runs cypress through the javascript API rather than the CLI, and
 * lets us conditionally load a config file and some other options along with it.
 */
const runCypress = async (suite = "e2e", exitFunction) => {
  if (!configs[suite]) {
    console.error(
      `Invalid suite: ${suite}, try one of: ${Object.keys(configs)}`,
    );
    await exitFunction(1);
  }

  const config = await configs[suite]();

  try {
    const { status, message, totalFailed, failures } = config.openMode
      ? await cypress.open(config)
      : await cypress.run(config);

    // At least one test failed
    if (totalFailed > 0) {
      await exitFunction(1);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Failed to run Cypress!\n", e);

    await exitFunction(1);
  }
};

module.exports = runCypress;
