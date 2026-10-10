// What a table block knows about the table, model or question it stands for.

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type { DatabaseId, IconName } from "metabase-types/api";

import type { ColumnSummary } from "../types";

import { STAGE_INDEX } from "./constants";

// Canvas-only tweaks: primary keys get a key, plain numerics get digits instead of the hash.
export function getCanvasColumnIcon(column: Lib.ColumnMetadata): IconName {
  if (Lib.isPrimaryKey(column)) {
    return "key";
  }
  const icon = getColumnIcon(column);
  return icon === "int" ? "number" : icon;
}

export type PickedTable = {
  table: Lib.Joinable;
  databaseId: DatabaseId;
  tableName: string;
  columns: ColumnSummary[];
};

export function summarizeColumns(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  stageIndex = STAGE_INDEX,
): ColumnSummary[] {
  return columns.map((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return {
      name: info.name,
      displayName: info.displayName,
      longDisplayName: info.longDisplayName,
      icon: getCanvasColumnIcon(column),
    };
  });
}

// What a table node needs to render on its own, without a compiled query.
export function describeTable(
  metadataProvider: Lib.MetadataProvider,
  table: Lib.Joinable,
  databaseId: DatabaseId,
): PickedTable {
  const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
  return {
    table,
    databaseId,
    tableName: Lib.displayInfo(query, STAGE_INDEX, table).displayName,
    columns: summarizeColumns(query, Lib.fieldableColumns(query, STAGE_INDEX)),
  };
}

export function excludedNames(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  stageIndex = STAGE_INDEX,
): string[] {
  return columns
    .map((column) => Lib.displayInfo(query, stageIndex, column))
    .filter((info) => !info.selected)
    .map((info) => info.name);
}
