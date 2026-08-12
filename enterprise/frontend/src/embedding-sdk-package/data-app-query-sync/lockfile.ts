import fs from "node:fs";
import path from "node:path";

import type { QueryLockEntry } from "./types";

export const QUERY_LOCKFILE = "queries_metadata.json";

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

function isQueryLockEntry(value: unknown): value is QueryLockEntry {
  return (
    value !== null &&
    typeof value === "object" &&
    "tableId" in value &&
    isPositiveInteger(value.tableId) &&
    "savedQuestionSourceId" in value &&
    isPositiveInteger(value.savedQuestionSourceId) &&
    "hash" in value &&
    typeof value.hash === "string" &&
    /^v1:sha256:[0-9a-f]{64}$/.test(value.hash)
  );
}

export function readQueryLockfile(appRoot: string): QueryLockEntry[] {
  const filePath = path.join(appRoot, QUERY_LOCKFILE);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (
    !Array.isArray(value) ||
    value.some((entry) => !isQueryLockEntry(entry))
  ) {
    throw new Error(`${QUERY_LOCKFILE} contains an invalid entry.`);
  }
  return value;
}

export function writeQueryLockfile(appRoot: string, entries: QueryLockEntry[]) {
  fs.writeFileSync(
    path.join(appRoot, QUERY_LOCKFILE),
    `${JSON.stringify(entries, null, 2)}\n`,
  );
}
