import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { CompileError } from "./errors";
import type { Node } from "./pratt";

export function getDatabase(
  query: Lib.Query,
  metadata?: Metadata,
): Database | null {
  const databaseId = Lib.databaseID(query);
  return metadata?.database(databaseId) ?? null;
}

/**
 * Assert compiler invariants and assumptions.
 * Throws a non-friendly error if the condition is false.
 */
export function assert(
  condition: any,
  msg: string,
  data?: any,
): asserts condition {
  if (!condition) {
    throw new Error(msg, data || {});
  }
}

/**
 * Check assumptions that might fail based on the query source.
 * Throws a user-friendly error if the condition is false.
 */
export function check(
  condition: any,
  msg: string,
  node: Node,
): asserts condition {
  if (!condition) {
    throw new CompileError(msg, node);
  }
}
