import * as Lib from "metabase-lib";

export function isColumnExtractable(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): boolean {
  const info = Lib.displayInfo(query, stageIndex, column);
  return (
    info.semanticType === "type/Email" ||
    info.semanticType === "type/URL" ||
    info.effectiveType === "type/DateTime"
  );
}
