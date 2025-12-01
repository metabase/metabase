const { embeddingSdkComponentTestConfig } = require("./config");

module.exports = {
  component: {
    ...embeddingSdkComponentTestConfig,
    baseUrl: undefined, // baseUrl is not a valid *component* config option,
  },
};
