import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

export function getDatabase(
  query: Lib.Query,
  metadata?: Metadata,
): Database | null {
  const databaseId = Lib.databaseID(query);
  return metadata?.database(databaseId) ?? null;
}

export function maybe<T extends { errors: Error[] }>(
  value: T,
): Omit<T, "errors"> {
  const { errors, ...rest } = value;
  if (errors.length > 0) {
    throw errors[0];
  }
  return rest;
}
