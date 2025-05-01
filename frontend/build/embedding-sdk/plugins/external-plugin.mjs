import path from "path";

import { EXTERNALS } from "../constants/externals.mjs";
import { ROOT_PATH } from "../constants/paths.mjs";
import { getPackageJsonContent } from "../utils/get-package-json-content.mjs";

const NO_EXTERNALS = [
  // Preserve all 3rd party CSS imports to bundle them
  // It's important because some frameworks like Next throw an error if a 3rd party JS file imports CSS
  /.*\.css$/,
];

const match = (id, patterns) =>
  patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(id);
    }

    return id === pattern || id.startsWith(pattern + "/");
  });

export const externalPlugin = () => ({
  name: "external",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (match(args.path, NO_EXTERNALS)) {
        return;
      }

      if (match(args.path, EXTERNALS)) {
        const packagePath = path.resolve(
          path.join(ROOT_PATH, "node_modules", args.path),
        );
        const packageJsonContent = getPackageJsonContent(packagePath);
        const sideEffects = packageJsonContent?.sideEffects ?? true;

        return { external: true, sideEffects };
      }
    });
  },
});
