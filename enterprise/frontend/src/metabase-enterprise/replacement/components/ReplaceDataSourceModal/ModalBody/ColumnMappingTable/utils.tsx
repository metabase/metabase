import type { TreeTableColumnDef } from "metabase/ui";
import type { ReplaceSourceColumnMapping } from "metabase-types/api";

import type { EntityInfo } from "../../types";

import { ColumnCell } from "./ColumnCell";
import type { ColumnMappingItem } from "./types";

function getEntityName(entityInfo: EntityInfo | undefined): string {
  if (entityInfo?.type === "table") {
    return entityInfo.table.display_name;
  } else if (entityInfo?.type === "card") {
    return entityInfo.card.name;
  }
  return "";
}

function getEntityHeader(entityName: string, columnCount: number): string {
  return `${entityName} (${columnCount})`;
}

function getSourceColumnCount(
  columnMappings: ReplaceSourceColumnMapping[],
): number {
  return columnMappings.filter(({ source }) => source != null).length;
}

function getTargetColumnCount(
  columnMappings: ReplaceSourceColumnMapping[],
): number {
  return columnMappings.filter(({ target }) => target != null).length;
}

function getSourceColumn(
  header: string,
): TreeTableColumnDef<ColumnMappingItem> {
  return {
    id: "source",
    header,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (item) => item.source?.display_name,
    cell: ({ row }) => {
      const item = row.original;
      return <ColumnCell column={item.source} />;
    },
  };
}

function getTargetColumn(
  header: string,
): TreeTableColumnDef<ColumnMappingItem> {
  return {
    id: "target",
    header,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (item) => item.target?.display_name,
    cell: ({ row }) => {
      const item = row.original;
      return <ColumnCell column={item.target} errors={item.errors} />;
    },
  };
}

export function getColumns(
  sourceInfo: EntityInfo | undefined,
  targetInfo: EntityInfo | undefined,
  columnMappings: ReplaceSourceColumnMapping[],
): TreeTableColumnDef<ColumnMappingItem>[] {
  const sourceHeader = getEntityHeader(
    getEntityName(sourceInfo),
    getSourceColumnCount(columnMappings),
  );
  const targetHeader = getEntityHeader(
    getEntityName(targetInfo),
    getTargetColumnCount(columnMappings),
  );

  return [getSourceColumn(sourceHeader), getTargetColumn(targetHeader)];
}

export function getRows(
  columnMappings: ReplaceSourceColumnMapping[],
): ColumnMappingItem[] {
  return columnMappings.map((columnMapping, index) => ({
    id: index,
    source: columnMapping.source,
    target: columnMapping.target,
    errors: columnMapping.errors,
  }));
}
