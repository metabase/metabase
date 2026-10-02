import path from "node:path";

export function getRelativeDefinitionLocation(
  appRoot: string,
  { filePath, exportName }: { filePath: string; exportName: string },
) {
  return `${path.relative(appRoot, filePath)}:${exportName}`;
}
