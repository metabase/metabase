import { slugify as toSlug } from "metabase/lib/formatting";
import type {
  ConcreteTableId,
  PythonTransformTableAliases,
} from "metabase-types/api";

import type { TableSelection } from "./types";

/**
 * Extract a ConcreteTableId from a source-tables value, which may be either
 * a bare integer (old format) or a map with table_id (new format).
 */
export function extractTableId(
  value: ConcreteTableId | Record<string, unknown>,
): ConcreteTableId | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value != null) {
    const id = (value as Record<string, unknown>)["table_id"];
    if (typeof id === "number") {
      return id as ConcreteTableId;
    }
  }
  return undefined;
}

export function getInitialTableSelections(
  tables: PythonTransformTableAliases | undefined,
) {
  if (tables && Object.keys(tables).length > 0) {
    return Object.entries(tables).map(([alias, value]) => ({
      tableId: extractTableId(value),
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
