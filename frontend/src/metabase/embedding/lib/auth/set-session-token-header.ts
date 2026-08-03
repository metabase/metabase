import type { OnBeforeRequestHandler } from "metabase/api/client";

import { getSessionTokenHeaders } from "./get-session-token-headers";

export const setSessionTokenHeader =
  (sessionToken: string): OnBeforeRequestHandler =>
  async () =>
    getSessionTokenHeaders(sessionToken);
