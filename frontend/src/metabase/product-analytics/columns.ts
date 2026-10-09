import * as Lib from "metabase-lib";

const STAGE = -1;

export const findColumn = (
  query: Lib.Query,
  name: string,
): Lib.ColumnMetadata => {
  const columns = Lib.visibleColumns(query, STAGE);
  const found = columns.find((column) => {
    const info = Lib.displayInfo(query, STAGE, column);
    return info.name === name;
  });
  if (!found) {
    throw new Error(`Column ${name} not found on pa_events_resolved`);
  }
  return found;
};
