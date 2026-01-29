/**
 * Bun plugin to transform Emotion styled components with Babel
 */
import { plugin } from "bun";

plugin({
  name: "emotion-transform",
  async setup(build) {
    const babel = await import("@babel/core");

    // Only transform .styled.tsx files - those have component selectors
    build.onLoad({ filter: /\.styled\.tsx$/ }, async (args) => {
      // Skip node_modules
      if (args.path.includes("node_modules")) {
        return undefined;
      }

      const source = await Bun.file(args.path).text();

      try {
        const result = await babel.transformAsync(source, {
          filename: args.path,
          babelrc: false,
          configFile: false,
          presets: [
            ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
          plugins: [["@emotion/babel-plugin", { sourceMap: false }]],
        });

        if (result?.code) {
          return {
            contents: result.code,
            loader: "jsx",
          };
        }
      } catch (e) {
        console.error(`Babel transform failed for ${args.path}:`, e);
      }

      return undefined;
    });
  },
});
