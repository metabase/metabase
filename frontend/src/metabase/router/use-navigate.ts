import { useCallback } from "react";
import { go, push, replace } from "react-router-redux";

import { useDispatch } from "metabase/redux";

import type { NavigateFunction, NavigateOptions, To } from "./types";
import { parsePath } from "./utils";

/**
 * react-router v7's `useNavigate`, implemented over react-router v3 via
 * `dispatch(push/replace/go)`.
 *
 * - `navigate(to, { replace?, state? })` pushes (or replaces) the location.
 * - `navigate(delta)` moves through the history stack (e.g. `navigate(-1)`).
 */
export function useNavigate(): NavigateFunction {
  const dispatch = useDispatch();

  return useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      if (typeof to === "number") {
        dispatch(go(to));
        return;
      }

      const navigate = options.replace ? replace : push;

      if (typeof to === "string" && options.state === undefined) {
        dispatch(navigate(to));
        return;
      }

      const location =
        typeof to === "string"
          ? { ...parsePath(to), state: options.state }
          : { ...to, state: options.state };
      dispatch(navigate(location));
    },
    [dispatch],
  ) as NavigateFunction;
}
