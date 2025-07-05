import fs from "fs";
import path from "path";

import { transform as esbuildTransform } from "esbuild";
import postcss from "postcss";
import postCssModulesPlugin from "postcss-modules";

import { CSS_MODULE_INJECT_FUNCTION_NAME } from "../constants/css-module-inject-function-name.mjs";
import { enhancedResolve } from "../utils/enhanced-resolve.mjs";
import { getCssModulesInjectCode } from "../utils/get-css-modules-inject-code.mjs";
import { getPostcssPlugins } from "../utils/get-postcss-plugins.mjs";

export const cssModulesPlugin = ({
  additionalCssModuleRegexps,
  resolve,
  generateScopedName,
}) => {
  const cssModulesRegExps = [/\.module\.css/, ...additionalCssModuleRegexps];
  const filter = new RegExp(
    `(${cssModulesRegExps.map((regexp) => regexp.source).join("|")})$`,
  );

  return {
    name: "css-modules",
    setup(build) {
      build.onResolve(
        { filter, namespace: "file" },
        ({ resolveDir, path: resolvePath }) => {
          const fullPath = enhancedResolve(resolveDir, resolvePath, {
            resolveNodeModules: false,
          });

          if (!fullPath) {
            return;
          }

          return {
            path: `${fullPath}#css-module`,
            namespace: "css-module",
            pluginData: { fullPath },
          };
        },
      );

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

      build.onLoad(
        { filter: /#css-module$/, namespace: "css-module" },
        async ({ pluginData }) => {
          const { fullPath } = pluginData;

          const source = await fs.promises.readFile(fullPath, "utf8");
          const namesByScopeNameMap = {};

          const result = await postcss([
            ...getPostcssPlugins(),
            postCssModulesPlugin({
              generateScopedName: (name, filename) => {
                const scopedName = generateScopedName(name, filename);

                namesByScopeNameMap[name] = scopedName;

                return scopedName;
              },
              resolve,
              // To prevent JSON metadata generation
              getJSON: () => {},
            }),
          ]).process(source, { from: fullPath });

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
            // `CSS_MODULE_INJECT_FUNCTION_NAME` is the function added by `setupBanners` function
            contents: `
              import "${fullPath}";
              import ${CSS_MODULE_INJECT_FUNCTION_NAME} from '#style-inject';

              export default ${JSON.stringify(namesByScopeNameMap)};

              ${CSS_MODULE_INJECT_FUNCTION_NAME}(${JSON.stringify(injectedCss)});
            `,
            pluginData: { css: result.css },
          };
        },
      );

      build.onResolve(
        { filter, namespace: "css-module" },
        ({ resolveDir, path: resolvePath, pluginData }) => ({
          path: path.join(resolveDir, resolvePath) + "#css-module-data",
          namespace: "css-module",
          pluginData,
        }),
      );

      build.onLoad(
        { filter: /#css-module-data$/, namespace: "css-module" },
        ({ pluginData }) => ({
          contents: pluginData.css,
          loader: "css",
        }),
      );
    },
  };
};
