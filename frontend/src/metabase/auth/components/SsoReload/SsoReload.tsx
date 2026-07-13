import { useEffect } from "react";

import { reload } from "metabase/utils/dom";

/**
 * Frontend routes can sometimes be prioritized over the backend ones. Reloading
 * lets the backend pick the SSO flow back up.
 */
export function SsoReload() {
  useEffect(() => {
    reload();
  }, []);

  return null;
}
