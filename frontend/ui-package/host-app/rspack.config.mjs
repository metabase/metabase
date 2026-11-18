import { readFileSync } from "node:fs";

import { rspack } from "@rspack/core";

export default {
  mode: "production",
  entry: "./src/main.tsx",
  output: {
    path: new URL("./dist/rspack", import.meta.url).pathname,
    clean: true,
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  experiments: { css: true },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: { syntax: "typescript", tsx: true },
            transform: { react: { runtime: "automatic" } },
          },
        },
        type: "javascript/auto",
      },
      // Font files referenced from fonts.css
      { test: /\.(woff2?|ttf|eot)$/, type: "asset/resource" },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      // Drop Vite's entry tag; the plugin injects the bundle itself.
      templateContent: readFileSync("./index.html", "utf-8").replace(
        /<script[^>]*src="\/src\/main\.tsx"[^>]*><\/script>/,
        "",
      ),
      scriptLoading: "module",
      inject: "body",
    }),
  ],
  performance: { hints: false },
};
