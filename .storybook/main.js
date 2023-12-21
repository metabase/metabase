const MiniCssExtractPlugin = require("mini-css-extract-plugin");
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
    "@storybook/addon-essentials",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
  ],
  babel: () => {},
  webpackFinal: storybookConfig => ({
    ...storybookConfig,
    plugins: [...storybookConfig.plugins, new MiniCssExtractPlugin()],
    module: {
      ...storybookConfig.module,
      rules: [
        ...storybookConfig.module.rules.filter(
          rule => !isCSSRule(rule) && !isSvgRule(rule),
        ),
        ...appConfig.module.rules.filter(
          rule => isCSSRule(rule) || isSvgRule(rule),
        ),
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
const isSvgRule = rule => rule.test && rule.test?.test(".svg");
