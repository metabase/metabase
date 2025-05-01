import path from "path";

import { ResolverFactory } from "oxc-resolver";

import { ALIAS } from "../constants/alias.mjs";
import { ROOT_PATH } from "../constants/paths.mjs";
import { RESOLVE_EXTENSIONS } from "../constants/resolve-extensions.mjs";

const normalizedAlias = Object.entries(ALIAS).reduce((acc, [key, value]) => {
  acc[key] = [value, null];

  return acc;
}, {});

const enhancedResolveInstance = new ResolverFactory({
  alias: normalizedAlias,
  extensions: RESOLVE_EXTENSIONS,
  tsconfig: {
    configFile: path.resolve(ROOT_PATH, "tsconfig.sdk.json"),
  },
  conditionNames: ["import", "require"],
});

export const enhancedResolve = (
  directory,
  request,
  { resolveNodeModules = false },
) => {
  if (request.startsWith("data:")) {
    return null;
  }

  const resolvedPath = enhancedResolveInstance.sync(directory, request).path;

  if (!resolvedPath) {
    throw new Error(`Unable to resolve resolve import: ${request}`);
  }

  if (!resolveNodeModules && resolvedPath.includes("node_modules")) {
    return null;
  }

  return resolvedPath;
};
