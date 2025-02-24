import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { ErrorWithMessage } from "./types";

export function getDatabase(
  query: Lib.Query,
  metadata?: Metadata,
): Database | null {
  const databaseId = Lib.databaseID(query);
  return metadata?.database(databaseId) ?? null;
}

export function isErrorWithMessage(err: unknown): err is ErrorWithMessage {
  return (
    typeof err === "object" &&
    err != null &&
    typeof (err as any).message === "string"
  );
}

export function getExpressionMode(startRule: string): Lib.ExpressionMode {
  switch (startRule) {
    case "expression":
      return "expression";
    case "aggregation":
      return "aggregation";
    case "boolean":
      return "filter";
  }
  throw new Error(`Unknown start rule: ${startRule}`);
}
