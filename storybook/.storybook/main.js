const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");
const appConfig = require("../../webpack.config");

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: [
    "../../frontend/**/*.stories.mdx",
    "../../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
  ],
  babel: () => ({
    rootMode: 'upward',
    cacheDirectory: path.join(__dirname, "../../.babel_cache")
  }),
  webpackFinal: webpackConfig => ({
    ...webpackConfig,
    plugins: [...webpackConfig.plugins, new MiniCssExtractPlugin()],
    module: {
      ...webpackConfig.module,
      rules: [
        ...webpackConfig.module.rules.filter(
          rule => !isCSSRule(rule) && !isSvgRule(rule),
        ),
        ...appConfig.module.rules.filter(
          rule => isCSSRule(rule) || isSvgRule(rule),
        ),
      ],
    },
    resolve: {
      ...webpackConfig.resolve,
      modules: [
        ...webpackConfig.resolve.modules,
        path.join(__dirname, "../node_modules")
      ],
      alias: appConfig.resolve.alias,
      extensions: appConfig.resolve.extensions,
    },
  }),
};

const isCSSRule = rule => rule.test.toString() === "/\\.css$/";
const isSvgRule = rule => rule.test && rule.test?.test(".svg");
