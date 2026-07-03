import { useMount } from "react-use";

import type { To } from "./types";
import { useNavigate } from "./use-navigate";

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: unknown;
}

/**
 * react-router v7's `<Navigate>`: navigates to `to` on mount. Defaults to a
 * push, pass `replace` to replace the current history entry.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Navigate
 */
export function Navigate({ to, replace = false, state }: NavigateProps): null {
  const navigate = useNavigate();

  // Navigate once on mount, mirroring react-router v7's <Navigate>.
  useMount(() => {
    navigate(to, { replace, state });
  });

  return null;
}
