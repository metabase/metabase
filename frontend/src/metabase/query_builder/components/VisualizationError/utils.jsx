import { getErrorMessage } from "metabase/api/utils";

// Error message for a failed query. 4xx comes as a string, 5xx as { status, data }.
// Returns "" when there is no message in the payload. (#71558)
export function getDatasetErrorMessage(error) {
  if (typeof error === "string") {
    return error;
  }
  const { data } = error;
  return data != null && typeof data === "object"
    ? getErrorMessage(data, "")
    : "";
}

export function stripRemarks(error) {
  /* SQL snippets in error messages are borked coming in for errors in many DBs.
   * You're expecting something with just your sql in the message,
   * but the whole error contains these remarks that MB added in. Confusing!
   */
  return error.replace(
    /-- Metabase:: userID: \d+ queryType: native queryHash: \w+\n/,
    "",
  );
}
