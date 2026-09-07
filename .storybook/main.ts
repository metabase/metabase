import path from "path";

import type { StorybookConfig } from "@storybook/react-webpack5";
import remarkGfm from "remark-gfm";

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");

const { CSS_CONFIG } = require("../frontend/build/shared/rspack/css-config");
const {
  SIDE_EFFECT_FREE_RULE,
} = require("../frontend/build/shared/rspack/side-effect-free-modules");
const appConfig = require("../rspack.main.config.js");
const { getStories } = require("./story-files.cjs");

const config: StorybookConfig = {
  stories: getStories({
    pathsFile: process.env.STORYBOOK_STORY_PATHS_FILE,
    // Allow filtering to specific story files via env var (used by stress tests)
    // STORYBOOK_STORIES_FILTER: comma-separated file paths relative to repo root
    // e.g. "frontend/src/.../Button.stories.tsx,frontend/src/.../Alert.stories.tsx"
    filter: process.env.STORYBOOK_STORIES_FILTER,
  }),
  staticDirs: [
    "../resources/frontend_client",
    "./msw-public",
    {
      from: "../frontend/test/__support__/custom-viz-fixtures/calendar-heatmap",
      to: "/custom-viz-fixtures/calendar-heatmap",
    },
  ],
  addons: [
    "@storybook/addon-webpack5-compiler-babel",
    {
      name: "@storybook/addon-essentials",
      options: {
        docs: false,
      },
    },
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
    "@storybook/addon-interactions",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],

  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      tsconfigPath: path.resolve(__dirname, "../tsconfig.json"),
    },
  },

  webpackFinal: (config) => {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          ...appConfig.resolve.alias,
        },
        extensions: appConfig.resolve.extensions,
        fallback: {
          ...config.resolve?.fallback,
          ...appConfig.resolve.fallback,
        },
      },
      plugins: [
        ...(config.plugins ?? []),
        new MiniCssExtractPlugin({
          ignoreOrder: true,
        }),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
        new webpack.EnvironmentPlugin({
          IS_EMBEDDING_SDK: "false",
        }),
      ],
      module: {
        ...config.module,
        rules: [
          SIDE_EFFECT_FREE_RULE,
          ...(config.module?.rules ?? []).filter(
            (rule) => !isCSSRule(rule) && !isSvgRule(rule),
          ),
          ...appConfig.module.rules.filter((rule: any) => isSvgRule(rule)),
          // We use MiniCssExtractPlugin, because Storybook can't properly work with `rspack.CssExtractRspackPlugin`
          {
            test: /\.css$/,
            use: [
              {
                loader: MiniCssExtractPlugin.loader,
                options: { publicPath: "./" },
              },
              { loader: "css-loader", options: CSS_CONFIG },
              { loader: "postcss-loader" },
            ],
          },
        ],
      },
    };
  },
};
export default config;

const isCSSRule = (rule: any) => rule.test?.toString() === "/\\.css$/";
const isSvgRule = (rule: any) => rule.test?.test(".svg");
