/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type { OnBeforeRequestHandler } from "metabase/api/client";
import { isEmbedPreview } from "metabase/embedding/config";
import { isDataAppDev } from "metabase/embedding-sdk/config";

/**
 * Tag requests coming from an embed preview (the page is iframed into itself).
 * Kept separate from `setRequestClientHeaders` because preview mode is
 * orthogonal to which client is embedding. Installed only by the public and SDK
 * embed flows — static and full-app deliberately don't tag preview requests
 * (see EMB-930 in `metabase/embedding/config`).
 */
export const setEmbedPreviewHeader: OnBeforeRequestHandler = async () => {
  if (isEmbedPreview() || isDataAppDev()) {
    return { headers: { "X-Metabase-Embedded-Preview": "true" } };
  }
};
