/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type { OnBeforeRequestHandler } from "metabase/api/client";

export const setReactSdkEmbedReferrerHeader: OnBeforeRequestHandler =
  async () => {
    return { headers: { "X-Metabase-Embed-Referrer": window.location.href } };
  };
