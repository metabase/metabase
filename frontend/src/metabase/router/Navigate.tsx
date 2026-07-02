import { useEffect } from "react";

import type { To } from "./types";
import { useNavigate } from "./use-navigate";

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: unknown;
}

/**
 * react-router v7's `<Navigate>`: navigates to `to` on mount. Defaults to a
 * push; pass `replace` to replace the current history entry.
 */
export function Navigate({ to, replace = false, state }: NavigateProps): null {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace, state });
    // Navigate once on mount, mirroring react-router v7's <Navigate>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
