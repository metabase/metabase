const fs = require("fs");
const path = require("path");

const webpack = require("webpack");

const {
  SVGO_CONFIG,
} = require("../../frontend/build/shared/rspack/svgo-config");
const mainConfig = require("../../rspack.main.config");

const SDK_PACKAGE_NAME = "@metabase/embedding-sdk-react";

const { isEmbeddingSdkPackageInstalled, embeddingSdkPath } =
  resolveEmbeddingSdkPackage();

console.log(
  `Embedding SDK is ${isEmbeddingSdkPackageInstalled ? "installed" : 'NOT installed, using locally built version from "resources/embedding-sdk"'}`,
);

console.log(`Embedding SDK path alias is resolved to ${embeddingSdkPath}`);

module.exports = {
  mode: "development",
  devtool: false,
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".css", ".svg"],
    alias: {
      ...mainConfig.resolve.alias,
      ...(embeddingSdkPath ? { [SDK_PACKAGE_NAME]: embeddingSdkPath } : null),
    },
    fallback: {
      path: false,
      fs: false,
      querystring: require.resolve("querystring-es3"),
    }, // FIXME: this might break file download tests, we might need to implement this properly
  },
  entry: [path.join(__dirname, "src", "index.js")],
  output: {
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    // Makes "Invalid Host/Origin header" errors go away.
    // Cypress component tests seem to run on `127.0.0.1`
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.svg/,
        type: "asset/source",
        resourceQuery: { not: [/component/] }, // *.svg?source
      },
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        resourceQuery: /component/, // *.svg?component
        use: [
          {
            loader: "@svgr/webpack",
            options: {
              ref: true,
              svgoConfig: SVGO_CONFIG,
            },
          },
        ],
      },
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /(node_modules|resources\/embedding-sdk\/dist)/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              "@babel/preset-react",
              "@babel/preset-typescript",
            ],
            targets: "last 5 Chrome versions",
            configFile: false,
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      React: "react",
    }),
  ],
};

function resolveEmbeddingSdkPackage() {
  try {
    const nodeModulesPath = path.resolve(__dirname, "../../node_modules");

    const sdkInNodeModulesPath = path.resolve(
      nodeModulesPath,
      SDK_PACKAGE_NAME,
    );

    // Try to resolve the package from the ancestor node_modules folder
    const hasEmbeddingSdkInNodeModules = fs.existsSync(sdkInNodeModulesPath);

    if (hasEmbeddingSdkInNodeModules) {
      return {
        isEmbeddingSdkPackageInstalled: true,
        embeddingSdkPath: sdkInNodeModulesPath,
      };
    }

    // Try to resolve the package with `require.resolve`
    const requirePackagePath = require.resolve(SDK_PACKAGE_NAME);

    if (requirePackagePath.includes("node_modules")) {
      return {
        isEmbeddingSdkPackageInstalled: true,
        embeddingSdkPath: requirePackagePath,
      };
    }
  } catch (err) {
    console.log(`Cannot resolve ${SDK_PACKAGE_NAME} via require.resolve:`, err);
  }

  const sdkLocalPackagePath = path.resolve(
    __dirname,
    "../../resources/embedding-sdk/dist/main.bundle.js",
  );

  if (fs.existsSync(sdkLocalPackagePath)) {
    return {
      isEmbeddingSdkPackageInstalled: false,
      embeddingSdkPath: sdkLocalPackagePath,
    };
  }

  console.warn(
    `Cannot resolve ${SDK_PACKAGE_NAME} via node_modules, require or locally built package.`,
  );

  return {
    isEmbeddingSdkPackageInstalled: false,
    embeddingSdkPath: null,
  };
}
