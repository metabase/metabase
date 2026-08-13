import path from "node:path";

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Where a definition lives, for an error an app author has to act on. Relative
 * to the app root, because an absolute path in a build log is noise.
 */
export function definitionLocation(
  appRoot: string,
  { filePath, exportName }: { filePath: string; exportName: string },
) {
  return `${path.relative(appRoot, filePath)}:${exportName}`;
}
