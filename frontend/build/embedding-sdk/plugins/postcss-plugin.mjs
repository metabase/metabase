import fs from "fs";

import { transform as esbuildTransform } from "esbuild";
import postcss from "postcss";

import { CSS_MODULE_INJECT_FUNCTION_NAME } from "../constants/css-module-inject-function-name.mjs";
import { getCssModulesInjectCode } from "../utils/get-css-modules-inject-code.mjs";
import { getPostcssPlugins } from "../utils/get-postcss-plugins.mjs";

export const postcssPlugin = () => {
  return {
    name: "postcss",

    setup(build) {
      build.onResolve({ filter: /^#style-inject$/ }, () => {
        return { path: "#style-inject", namespace: "#style-inject" };
      });

      build.onLoad(
        { filter: /^#style-inject$/, namespace: "#style-inject" },
        () => {
          return {
            contents: getCssModulesInjectCode(),
            loader: "js",
          };
        },
      );

      build.onLoad({ filter: /\.css$/ }, async (args) => {
        const source = await fs.promises.readFile(args.path, "utf8");

        const result = await postcss(getPostcssPlugins()).process(source, {
          from: args.path,
        });

        const injectedCss = (
          await esbuildTransform(result.css, {
            minify: build.initialOptions.minify,
            minifyIdentifiers: build.initialOptions.minifyIdentifiers,
            minifySyntax: build.initialOptions.minifySyntax,
            minifyWhitespace: build.initialOptions.minifyWhitespace,
            logLevel: build.initialOptions.logLevel,
            loader: "css",
          })
        ).code;

        return {
          contents: `
            import ${CSS_MODULE_INJECT_FUNCTION_NAME} from '#style-inject';

            ${CSS_MODULE_INJECT_FUNCTION_NAME}(${JSON.stringify(injectedCss)})
          `,
          loader: "js",
        };
      });
    },
  };
};
