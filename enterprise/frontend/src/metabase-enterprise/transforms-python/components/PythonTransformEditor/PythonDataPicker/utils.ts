import { slugify as toSlug } from "metabase/lib/formatting";
import type { PythonTransformTableAliases } from "metabase-types/api";

import type { TableSelection } from "./types";

export function getInitialTableSelections(
  tables: PythonTransformTableAliases | undefined,
) {
  if (tables && Object.keys(tables).length > 0) {
    return Object.entries(tables).map(([alias, tableId]) => ({
      tableId,
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
  const tableAliases: PythonTransformTableAliases = {};

  for (const selection of selections) {
    const { alias, tableId } = selection;
    if (tableId !== undefined && alias !== "") {
      tableAliases[alias] = tableId;
    }
  }
  return tableAliases;
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
