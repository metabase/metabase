/* eslint-disable metabase/no-literal-metabase-strings */

import { match } from "ts-pattern";
import { t } from "ttag";

export type McpAppsUserAndSettingsFetchErrorType = "auth" | "network";

export function getMcpAppsUserAndSettingsFetchErrorType(
  error: unknown,
): McpAppsUserAndSettingsFetchErrorType {
  if (!error || typeof error !== "object") {
    return "network";
  }

  if ("status" in error && error.status === 401) {
    return "auth";
  }

  return "network";
}

export const getMcpAppsUserAndSettingsFetchErrorMessage = (
  type: McpAppsUserAndSettingsFetchErrorType,
): string =>
  match(type)
    .with(
      "auth",
      () =>
        t`Authentication failed. Try signing out and signing back in, then ask your MCP client to show this again.`,
    )
    .with(
      "network",
      () =>
        t`Could not connect to Metabase. Make sure this MCP client is enabled in AI settings and that Metabase is reachable.`,
    )
    .exhaustive();
