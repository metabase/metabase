import fs from "fs";

import { transform as svgrTransform } from "@svgr/core";
import path from "path";

/**
 * We have to use a custom plugin, because `esbuild-plugin-svgr` as a side-effect disables svg processing in `css` files
 * Also we anyway have to handle both `?component` and `?source` resource queries
 */
export const svgPlugin = ({ getFullPathFromResolvePath }) => ({
  name: "svg-plugin",
  setup(build) {
    const { alias } = build.initialOptions;

    build.onResolve({ filter: /\.svg\?component$/ }, (args) => ({
      path: args.path,
      namespace: "svg-component",
      pluginData: args,
    }));

    build.onResolve({ filter: /\.svg\?source$/ }, (args) => ({
      path: args.path,
      namespace: "svg-source",
      pluginData: args,
    }));

    build.onLoad(
      { filter: /.*/, namespace: "svg-component" },
      async ({ path: resolvePath, pluginData }) => {
        const { resolveDir } = pluginData;
        const normalizedResolvePath = resolvePath.replace(/\?component$/, "");

        const fullPath = getFullPathFromResolvePath({
          resolveDir,
          resolvePath: normalizedResolvePath,
          aliases: alias,
        });

        const source = await fs.promises.readFile(fullPath, "utf8");

        const contents = await svgrTransform(
          source,
          {
            plugins: ["@svgr/plugin-jsx"],
            ref: true,
          },
          {
            filePath: fullPath,
          },
        );

        return {
          contents,
          loader: "jsx",
        };
      },
    );

    build.onLoad(
      { filter: /.*/, namespace: "svg-source" },
      async ({ path: resolvePath, pluginData }) => {
        const { resolveDir } = pluginData;

        const normalizedResolvePath = resolvePath.replace(/\?source$/, "");
        const svgFilePath = path.isAbsolute(normalizedResolvePath)
          ? normalizedResolvePath
          : path.join(resolveDir, normalizedResolvePath);

        const source = await fs.promises.readFile(svgFilePath, "utf8");

        return {
          contents: `export default ${JSON.stringify(source)};`,
          loader: "js",
        };
      },
    );
  },
});
