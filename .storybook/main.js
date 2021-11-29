const appConfig = require("../webpack.config");

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: [
    "../frontend/**/*.stories.mdx",
    "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: ["@storybook/addon-links", "@storybook/addon-essentials"],
  webpackFinal: storybookConfig => ({
    ...storybookConfig,
    resolve: {
      ...storybookConfig.resolve,
      alias: appConfig.resolve.alias,
    },
  }),
};
