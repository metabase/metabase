/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import { version as hostReactVersion } from "react";

import type { OnBeforeRequestHandler } from "metabase/api/client";

export const setReactSdkReactVersionHeader: OnBeforeRequestHandler =
  async () => {
    return { headers: { "X-Metabase-Client-React-Version": hostReactVersion } };
  };
