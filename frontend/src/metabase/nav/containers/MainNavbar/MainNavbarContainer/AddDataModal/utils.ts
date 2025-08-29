import type { Database } from "metabase-types/api";

const validTabArray = ["db", "csv", "gsheets"] as const;
const validTabs = new Set<string>(validTabArray);

type AddDataTab = (typeof validTabArray)[number];

export const isValidTab = (v: string | null): v is AddDataTab =>
  typeof v === "string" && validTabs.has(v);

export function shouldShowUploadPanel({
  allDatabases = [],
  allUploadableDatabases = [],
}: {
  allDatabases: Database[] | undefined;
  allUploadableDatabases: Database[] | undefined;
}) {
  if (!allUploadableDatabases?.length || !allDatabases) {
    return false;
  }

  if (
    allUploadableDatabases.length === 1 &&
    allDatabases.length > 1 &&
    allUploadableDatabases[0]?.engine === "h2"
  ) {
    return false;
  }

  return true;
}
