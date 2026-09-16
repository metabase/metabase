const { plugin: cypressGrepPlugin } = require("@cypress/grep/plugin");
const cypressSplit = require("cypress-split");

function setupSpecSelection(on, config) {
  // `grepIntegrationFolder` needs to point to the root!
  // See: https://github.com/cypress-io/cypress/issues/24452#issuecomment-1295377775
  config.expose.grepIntegrationFolder = "../../";
  config.expose.grepFilterSpecs = true;
  config.expose.grepOmitFiltered = true;

  cypressGrepPlugin(config);

  if (process.env.CI) {
    cypressSplit(on, config);
  }
}

module.exports = { setupSpecSelection };
