import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type {
  ReplaceSourceColumnErrorType,
  ReplaceSourceColumnMapping,
} from "metabase-types/api";

import { getColumnErrorMessage } from "../../../../utils";
import type { EntityInfo } from "../../types";

import { NameCell } from "./NameCell";
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
    enableSorting: true,
    accessorFn: (item) => item.source?.display_name,
    cell: ({ row }) => {
      const item = row.original;
      if (item.source == null) {
        return null;
      }
      return <NameCell column={item.source} />;
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
    enableSorting: true,
    accessorFn: (item) => item.target?.display_name,
    cell: ({ row }) => {
      const item = row.original;
      if (item.target == null) {
        return null;
      }
      return <NameCell column={item.target} />;
    },
  };
}

function getErrorMessage(errors: ReplaceSourceColumnErrorType[]) {
  const messages = errors
    .map(getColumnErrorMessage)
    .filter((message) => message != null);
  return messages.length > 0 ? messages.join(" ") : null;
}

function getDetailsColumn(): TreeTableColumnDef<ColumnMappingItem> {
  return {
    id: "errors",
    header: t`Details`,
    enableSorting: true,
    accessorFn: (item) => getErrorMessage(item.errors ?? []),
    cell: ({ row }) => {
      const { errors } = row.original;
      const message = getErrorMessage(errors ?? []);
      if (message == null) {
        return null;
      }
      return <Ellipsified>{message}</Ellipsified>;
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

  return [
    getSourceColumn(sourceHeader),
    getTargetColumn(targetHeader),
    getDetailsColumn(),
  ];
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
