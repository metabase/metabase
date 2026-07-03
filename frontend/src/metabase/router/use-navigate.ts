import type { LocationDescriptor } from "history";
import { useCallback } from "react";

import type { NavigateFunction, NavigateOptions, To } from "./types";
import { useRouter } from "./use-router";
import { parsePath } from "./utils";

function toLocationDescriptor(to: To, state: unknown): LocationDescriptor {
  if (typeof to === "string" && state === undefined) {
    return to;
  }
  if (typeof to === "string") {
    return { ...parsePath(to), state };
  }
  return { ...to, state };
}

/**
 * react-router v7's `useNavigate`, implemented over react-router v3's imperative
 * router (`router.push/replace/go`).
 *
 * - `navigate(to, { replace?, state? })` pushes (or replaces) the location.
 * - `navigate(delta)` moves through the history stack (e.g. `navigate(-1)`).
 *
 * Absolute paths only: v7's relative `to` (`".."`, `"child"`) is not resolved on
 * v3, that lands with the engine swap and modal routes (Phase 1.3).
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useNavigate
 */
export function useNavigate(): NavigateFunction {
  const { router } = useRouter();

  return useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      if (typeof to === "number") {
        router.go(to);
        return;
      }

      const location = toLocationDescriptor(to, options.state);
      if (options.replace) {
        router.replace(location);
      } else {
        router.push(location);
      }
    },
    [router],
  ) as NavigateFunction;
}
