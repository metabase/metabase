import fs from "fs";
import path from "path";

import { transform as esbuildTransform } from "esbuild";
import postcss from "postcss";
import postCssModulesPlugin from "postcss-modules";

import postcssConfig from "../../../../postcss.config.js";
import { CSS_MODULE_INJECT_FUNCTION_NAME } from "../constants/css-module-inject-function-name.mjs";
import { getFullPathFromResolvePath } from "../utils/get-full-path-from-resolve-path.mjs";

export const cssModulesPlugin = ({
  additionalCssModuleRegexps,
  resolve,
  generateScopedName,
}) => {
  const cssModulesRegExps = [/\.module\.css/, ...additionalCssModuleRegexps];
  const filter = new RegExp(
    `(${cssModulesRegExps.map((regexp) => regexp.source).join("|")})$`,
  );

  // Remove the `postcss-modules` from the plugins list, because we apply our custom plugin
  const filteredPostCssPlugins = postcssConfig.plugins.filter(
    (plugin) => plugin.postcssPlugin !== "postcss-modules",
  );

  return {
    name: "css-modules",
    setup(build) {
      const { alias } = build.initialOptions;

      build.onResolve(
        { filter, namespace: "file" },
        ({ resolveDir, path: resolvePath }) => {
          const fullPath = getFullPathFromResolvePath({
            resolveDir,
            resolvePath,
            aliases: alias,
          });

          return {
            path: `${fullPath}#css-module`,
            namespace: "css-module",
            pluginData: { fullPath },
          };
        },
      );

      build.onLoad(
        { filter: /#css-module$/, namespace: "css-module" },
        async ({ pluginData }) => {
          const { fullPath } = pluginData;

          const source = await fs.promises.readFile(fullPath, "utf8");
          const json = {};

          const result = await postcss([
            ...filteredPostCssPlugins,
            postCssModulesPlugin({
              generateScopedName: (name, filename) => {
                const scopedName = generateScopedName(name, filename);

                json[name] = scopedName;

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
              export default ${JSON.stringify(json)};
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
