import fs from "fs";
import path from "path";

import type { StorybookConfig } from "@storybook/react-webpack5";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import webpack, { type Configuration } from "webpack";

import { getBuildInfoValues } from "build-configs/embedding-sdk/rspack/get-build-info-values";

const { isEmbeddingSdkPackageInstalled, embeddingSdkPackageVersion } =
  resolveEmbeddingSdkPackage();

const rootRepoPath = path.resolve(__dirname, "../../../../");

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic path, cannot use static import
const appConfig: Configuration = require(
  path.resolve(rootRepoPath, "rspack.embedding-sdk-bundle.config"),
);

type ModuleRule = NonNullable<
  NonNullable<Configuration["module"]>["rules"]
>[number];

const isCSSRule = (rule: ModuleRule): boolean =>
  typeof rule === "object" &&
  rule !== null &&
  rule.test?.toString() === "/\\.css$/";

const isSvgRule = (rule: ModuleRule): boolean =>
  typeof rule === "object" &&
  rule !== null &&
  rule.test instanceof RegExp &&
  rule.test.test(".svg");

interface ResolvedSdkPackage {
  isEmbeddingSdkPackageInstalled: boolean;
  embeddingSdkPackageVersion: string;
}

function resolveEmbeddingSdkPackage(): ResolvedSdkPackage {
  let isEmbeddingSdkPackageInstalled = false;
  let embeddingSdkPackageVersion: string;

  try {
    const packagePath = require.resolve("@metabase/embedding-sdk-react");
    if (packagePath.includes("node_modules")) {
      isEmbeddingSdkPackageInstalled = true;
    }

    const packageJsonContent = fs.readFileSync(
      path.join(packagePath, "package.json"),
      "utf-8",
    );
    embeddingSdkPackageVersion = JSON.stringify(
      (JSON.parse(packageJsonContent) as { version: string }).version,
    );
  } catch {
    const sdkPackageTemplateJson = fs.readFileSync(
      path.resolve(
        "./enterprise/frontend/src/embedding-sdk-package/package.template.json",
      ),
      "utf-8",
    );
    const sdkPackageTemplateJsonContent = JSON.parse(
      sdkPackageTemplateJson,
    ) as { version: string };
    embeddingSdkPackageVersion = JSON.stringify(
      sdkPackageTemplateJsonContent.version,
    );
  }

  return {
    isEmbeddingSdkPackageInstalled,
    embeddingSdkPackageVersion,
  };
}

const config: StorybookConfig = {
  stories: [
    path.resolve(
      rootRepoPath,
      "frontend/src/embedding-sdk-{bundle,shared}/**/*.stories.tsx",
    ),
    path.resolve(
      rootRepoPath,
      "enterprise/frontend/src/embedding-sdk-ee/**/*.stories.tsx",
    ),
    path.resolve(
      rootRepoPath,
      "enterprise/frontend/src/embedding-sdk-package/**/*.stories.tsx",
    ),
  ],
  staticDirs: [
    path.resolve(rootRepoPath, "resources/frontend_client"),
    "./msw-public",
  ],
  addons: [
    "@storybook/addon-webpack5-compiler-babel",
    "@storybook/addon-interactions",
    "@storybook/addon-essentials",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  typescript: {
    reactDocgen: false,
  },
  webpackFinal: (storybookConfig) => ({
    ...storybookConfig,
    plugins: [
      ...(storybookConfig.plugins ?? []),
      new MiniCssExtractPlugin(),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.EnvironmentPlugin({
        IS_EMBEDDING_SDK: "true",
        ...getBuildInfoValues({ version: embeddingSdkPackageVersion }),
      }),
    ],
    module: {
      ...storybookConfig.module,
      rules: [
        ...(storybookConfig.module?.rules ?? []).filter(
          (rule) => !isCSSRule(rule) && !isSvgRule(rule),
        ),
        ...(appConfig.module?.rules ?? []).filter(
          (rule) => isCSSRule(rule) || isSvgRule(rule),
        ),
      ],
    },
    resolve: {
      ...storybookConfig.resolve,
      alias: {
        ...appConfig.resolve?.alias,
        ...(isEmbeddingSdkPackageInstalled && {
          // $ means that only exact "embedding-sdk-package" imports will be rerouted, all nested embedding-sdk-package/* will still be resolved locally
          "embedding-sdk-package$":
            require.resolve("@metabase/embedding-sdk-react"),
        }),
      },
      extensions: appConfig.resolve?.extensions,
      fallback: {
        ...storybookConfig.resolve?.fallback,
        ...appConfig.resolve?.fallback,
      },
    },
  }),
};

// eslint-disable-next-line import/no-default-export -- required by Storybook
export default config;
