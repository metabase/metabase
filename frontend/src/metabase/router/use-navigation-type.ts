import { useNavigationType as useV7NavigationType } from "react-router";

import type { Action } from "./types";

/**
 * react-router v7's `useNavigationType`: the navigation that produced the
 * current location. Replaces v3's `location.action`.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useNavigationType
 */
export function useNavigationType(): Action {
  return useV7NavigationType();
}
