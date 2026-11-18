/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type { OnBeforeRequestHandler } from "metabase/api/client";
import { isDataAppDev } from "metabase/embedding-sdk/config";

/**
 * Tag requests from a data app's dev preview, which runs the app's queries and
 * actions without them existing on the instance.
 */
export const setDataAppDevHeader: OnBeforeRequestHandler = async () => {
  if (isDataAppDev()) {
    return { headers: { "X-Metabase-Data-App-Dev": "true" } };
  }
};
