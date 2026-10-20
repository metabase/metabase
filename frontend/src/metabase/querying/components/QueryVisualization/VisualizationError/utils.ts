import { getErrorMessage } from "metabase/api/utils";
import type { DatasetError } from "metabase-types/api";

// Error message for a failed query. 4xx comes as a string, 5xx as { status, data }.
// Returns "" when there is no message in the payload. (#71558)
export function getDatasetErrorMessage(error: DatasetError): string {
  if (typeof error === "string") {
    return error;
  }
  const { data } = error;
  return data != null && typeof data === "object"
    ? getErrorMessage(data, "")
    : "";
}

export function stripRemarks(error: string | undefined): string {
  /* SQL snippets in error messages are borked coming in for errors in many DBs.
   * You're expecting something with just your sql in the message,
   * but the whole error contains these remarks that MB added in. Confusing!
   */
  if (!error) {
    return "";
  }
  return error.replace(
    /-- Metabase:: userID: \d+ queryType: native queryHash: \w+\n/,
    "",
  );
}
