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

  // Key the effect on the serialized target so an equal object literal recreated
  // each render does not re-navigate (matching v7's `jsonPath` dependency).
  const target = JSON.stringify({ to, replace, state });

  useEffect(() => {
    const { to, replace, state } = JSON.parse(target) as NavigateProps;
    navigate(to, { replace, state });
  }, [navigate, target]);

  return null;
}
