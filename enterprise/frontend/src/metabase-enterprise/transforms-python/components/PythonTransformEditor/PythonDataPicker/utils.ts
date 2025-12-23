import { slugify as toSlug } from "metabase/lib/formatting";
import type {
  ConcreteTableId,
  PythonTransformTableAliases,
  SourceTableRef,
  Table,
  TableId,
} from "metabase-types/api";

import type { TableSelection } from "./types";

export function getInitialTableSelections(
  tables: PythonTransformTableAliases | undefined,
) {
  if (tables && Object.keys(tables).length > 0) {
    return Object.entries(tables).map(([alias, ref]) => ({
      tableId: ref.table_id ?? undefined,
      alias,
    }));
  }
  // Start with one empty row by default
  return [
    {
      tableId: undefined,
      alias: "",
    },
  ];
}

/**
 * Convert table selections to table aliases with full table references.
 * The tableInfo array is used to look up database_id, schema, and table name for each selected table.
 */
export function selectionsToTableAliases(
  selections: TableSelection[],
  tableInfo: Table[] = [],
): PythonTransformTableAliases {
  const tableAliases: PythonTransformTableAliases = {};
  const tableById = new Map(tableInfo.map((t) => [t.id, t]));

  for (const selection of selections) {
    const { alias, tableId } = selection;
    if (tableId !== undefined && alias !== "") {
      const table = tableById.get(tableId);
      const ref: SourceTableRef = {
        database_id: table?.db_id ?? 0,
        schema: table?.schema ?? null,
        table: table?.name ?? "",
        table_id: tableId,
        display_name: table?.display_name,
      };
      tableAliases[alias] = ref;
    }
  }
  return tableAliases;
}

/**
 * Extract table IDs from table aliases for use in UI components that need just the IDs.
 */
export function getTableIdsFromAliases(
  tables: PythonTransformTableAliases,
): ConcreteTableId[] {
  return Object.values(tables)
    .map((ref) => ref.table_id)
    .filter((id): id is ConcreteTableId => id !== null);
}

export function slugify(
  name: string,
  usedNames: Set<string> = new Set(),
  allowThisAliasIfItExists?: string,
) {
  if (name === "") {
    return "";
  }

  const plain = toSlug(name).replace(/\./, "_");
  if (plain === allowThisAliasIfItExists) {
    return plain;
  }
  if (!usedNames.has(plain)) {
    return plain;
  }
  for (let index = 1; index <= 100; index++) {
    const alias = `${plain}_${index}`;
    if (!usedNames.has(alias)) {
      return alias;
    }
  }
  return name;
}

export function isConcreteTableId(
  id: TableId | undefined,
): id is ConcreteTableId {
  return typeof id === "number";
}
