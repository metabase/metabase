import { defineConfig } from "@rsbuild/core";
import { pluginMdx } from "@rsbuild/plugin-mdx";
import { pluginReact } from "@rsbuild/plugin-react";
import type { StorybookConfig } from "storybook-react-rsbuild";

const { CSS_CONFIG } = require("../frontend/build/shared/rspack/css-config");
const appConfig = require("../rspack.main.config.js");

const mainAppStories = [
  "../frontend/**/*.mdx",
  "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  "../enterprise/frontend/**/*.stories.@(js|jsx|ts|tsx)",
];

const config: StorybookConfig = {
  stories: mainAppStories,
  staticDirs: ["../resources/frontend_client", "./msw-public"],
  addons: [
    "@storybook/addon-webpack5-compiler-babel",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],

  framework: {
    name: "storybook-react-rsbuild",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },

  rsbuildFinal: (rsBuildConfig) => {
    return {
      ...rsBuildConfig,
      plugins: [pluginReact(), pluginMdx()],
      tools: {
        rspack: (rsPackConfig) => {
          console.log("builtin rspack", rsPackConfig);
          console.log("metabase appConfig", appConfig);

          console.log("builtin rules module", rsPackConfig.module.rules);
          console.log("metabase rules module", appConfig.module.rules);

          return {
            ...rsPackConfig,
            resolve: {
              ...rsPackConfig.resolve,
              alias: {
                ...rsPackConfig.resolve?.alias,
                ...appConfig.resolve.alias,
              },
              extensions: appConfig.resolve.extensions,
            },
            plugins: [
              ...(rsPackConfig.plugins ?? []),
              ...(appConfig.plugins ?? []),
            ],
            module: {
              ...rsPackConfig.module,
              rules: [
                ...(rsPackConfig.module?.rules ?? []).filter(
                  (rule) => !isCSSRule(rule) && !isSvgRule(rule),
                ),
                ...appConfig.module.rules.filter(
                  (rule: any) => isSvgRule(rule) || isCSSRule(rule),
                ),
              ],
            },
          };
        },
      },
    };
  },
};

// Storybook v8 requires default export
// eslint-disable-next-line import/no-default-export
export default config;

const isCSSRule = (rule: any) => rule.test?.toString() === "/\\.css$/";
const isSvgRule = (rule: any) => rule.test?.test(".svg");
