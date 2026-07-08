import { useEffect } from "react";

import type { To } from "./types";
import { useNavigate } from "./use-navigate";

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: unknown;
}

/**
 * react-router v7's `<Navigate>`: navigates to `to` on mount, and again whenever
 * `to`/`replace`/`state` change. Defaults to a push, pass `replace` to replace
 * the current history entry.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Navigate
 */
export function Navigate({ to, replace = false, state }: NavigateProps): null {
  const navigate = useNavigate();

  // Key the effect on the serialized path (always string-valued, so safe to
  // stringify) so an equal `to` object recreated each render does not
  // re-navigate. `state` stays raw in the deps and is passed by reference, both
  // matching v7's <Navigate>.
  const jsonTo = JSON.stringify(to);

  useEffect(() => {
    navigate(to, { replace, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, jsonTo, replace, state]);

  return null;
}
