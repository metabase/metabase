import { slugify as toSlug } from "metabase/utils/formatting";
import type {
  PythonTransformTableAliases,
  PythonTransformTableEntry,
  Table,
} from "metabase-types/api";

import type { TableSelection } from "./types";

export function getInitialTableSelections(
  tables: PythonTransformTableAliases | undefined,
) {
  if (tables && tables.length > 0) {
    return tables.map(({ alias, table_id }) => ({
      tableId: table_id,
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

export function selectionsToTableAliases(
  selections: TableSelection[],
  tableInfo: Table[],
): PythonTransformTableAliases {
  return selections
    .filter((s) => s.tableId !== undefined && s.alias !== "")
    .map((s) => {
      const table = tableInfo.find((tbl) => tbl.id === s.tableId);
      if (!table || !s.tableId) {
        return null;
      }
      return {
        alias: s.alias,
        table_id: s.tableId,
        schema: table.schema,
        database_id: table.db_id,
      } satisfies PythonTransformTableEntry;
    })
    .filter((t) => t !== null);
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
