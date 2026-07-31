import { useEffect } from "react";

import type { To } from "./types";
import { useLocation } from "./use-location";
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
  // A mounted `<Navigate>` re-asserts its target when the location moves out
  // from under it, so going back lands forward again. That used to fall out of
  // `navigate`'s identity churning per location, which only the declarative
  // `useNavigate` does: inside a data router it is stable across navigations.
  // Depend on the pathname directly so the behavior does not rest on which
  // variant is in play.
  const { pathname } = useLocation();

  // Key the effect on the serialized path (always string-valued, so safe to
  // stringify) so an equal `to` object recreated each render does not
  // re-navigate. `state` stays raw in the deps and is passed by reference, both
  // matching v7's <Navigate>.
  const jsonTo = JSON.stringify(to);

  useEffect(() => {
    navigate(to, { replace, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, pathname, jsonTo, replace, state]);

  return null;
}
