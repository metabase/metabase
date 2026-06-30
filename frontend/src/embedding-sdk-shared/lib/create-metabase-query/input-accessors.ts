import { isObject } from "metabase-types/guards";

import { type TableInput, isTableReference } from "./input-guards";

type ID = string | number;

export function getTableIdFromInput(input: unknown): ID | null {
  if (!isObject(input)) {
    return null;
  }

  if ("source" in input && isTableReference(input.source)) {
    return input.source.id;
  }

  return null;
}

export function getTableDatabaseIdFromInput(input: TableInput): number | null {
  if ("source" in input && isTableReference(input.source)) {
    return input.source.databaseId;
  }

  return null;
}
