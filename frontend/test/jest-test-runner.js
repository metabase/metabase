const runCircus = require("jest-circus/runner").default;

/**
 * Imports load lazily (see jest.base.conf.js), so a module can load between a
 * hook and its test, or after a test ends, when async rendering settles. Jest
 * treats a load in those gaps as an import outside the test and throws. Keep
 * the flag up for the whole file.
 */
module.exports = (globalConfig, config, environment, runtime, ...rest) => {
  runtime.leaveTestCode = () => {};
  return runCircus(globalConfig, config, environment, runtime, ...rest);
};
