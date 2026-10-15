/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";

export const getSessionTokenHeaders = (
  sessionToken: string,
): Partial<OnBeforeRequestHandlerConfig> => ({
  headers: { "X-Metabase-Session": sessionToken },
});
