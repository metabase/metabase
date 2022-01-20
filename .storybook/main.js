const appConfig = require("../webpack.config");

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: [
    "../frontend/**/*.stories.mdx",
    "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    {
      name: "@storybook/addon-essentials",
    },
    {
      name: "@storybook/addon-links",
    },
    {
      name: "@storybook/addon-postcss",
      options: {
        postcssLoaderOptions: {
          implementation: require("postcss"),
        },
      },
    },
  ],
  webpackFinal: storybookConfig => ({
    ...storybookConfig,
    resolve: {
      ...storybookConfig.resolve,
      alias: appConfig.resolve.alias,
    },
  }),
};
