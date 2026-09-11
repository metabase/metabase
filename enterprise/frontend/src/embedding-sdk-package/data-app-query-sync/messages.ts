import path from "node:path";

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getRelativeDefinitionLocation(
  appRoot: string,
  { filePath, exportName }: { filePath: string; exportName: string },
) {
  return `${path.relative(appRoot, filePath)}:${exportName}`;
}
