const appConfig = require("../webpack.config");

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: [
    "../frontend/**/*.stories.mdx",
    "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: ["@storybook/addon-essentials", "@storybook/addon-links"],
  webpackFinal: storybookConfig => ({
    ...storybookConfig,
    module: {
      ...storybookConfig.module,
      rules: [
        ...storybookConfig.module.rules.filter(rule => !isCSSRule(rule)),
        ...appConfig.module.rules.filter(rule => isCSSRule(rule)),
      ],
    },
    resolve: {
      ...storybookConfig.resolve,
      alias: appConfig.resolve.alias,
      extensions: appConfig.resolve.extensions,
    },
  }),
};

const isCSSRule = rule => rule.test.toString() === "/\\.css$/";
