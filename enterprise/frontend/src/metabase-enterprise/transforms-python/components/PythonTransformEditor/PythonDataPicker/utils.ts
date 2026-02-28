import { slugify as toSlug } from "metabase/lib/formatting";
import type { PythonTransformTableAliases } from "metabase-types/api";

import type { TableSelection } from "./types";

export function getInitialTableSelections(
  tables: PythonTransformTableAliases | undefined,
) {
  if (tables && tables.length > 0) {
    return tables.map(({ alias, table }) => ({
      tableId: table,
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
): PythonTransformTableAliases {
  return selections
    .filter((s) => s.tableId !== undefined && s.alias !== "")
    .map((s) => ({ alias: s.alias, table: s.tableId! }));
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
