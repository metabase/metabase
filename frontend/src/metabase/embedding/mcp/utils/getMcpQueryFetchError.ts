/* eslint-disable metabase/no-literal-metabase-strings */

import { match } from "ts-pattern";
import { t } from "ttag";

export type McpQueryFetchErrorType = "auth" | "expired" | "network";

export function getMcpQueryFetchErrorType(
  error: unknown,
): McpQueryFetchErrorType {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return "network";
  }

  if (error.status === 401 || error.status === 403) {
    return "auth";
  }

  // The handle store is user-scoped and reaped, so a 404 is an expired handle
  // rather than a missing endpoint.
  if (error.status === 404) {
    return "expired";
  }

  return "network";
}

export const getMcpQueryFetchErrorMessage = (
  type: McpQueryFetchErrorType,
): string =>
  match(type)
    .with(
      "auth",
      () =>
        t`Authentication failed. Try signing out and signing back in, then ask your MCP client to show this again.`,
    )
    .with(
      "expired",
      () =>
        t`This visualization has expired. Ask your MCP client to run the query again.`,
    )
    .with(
      "network",
      () =>
        t`Could not load this visualization. Make sure Metabase is reachable, then ask your MCP client to show this again.`,
    )
    .exhaustive();
