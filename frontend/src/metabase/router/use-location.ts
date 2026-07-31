import { useContext } from "react";
import {
  type Location,
  UNSAFE_LocationContext,
  useLocation,
} from "react-router";

/**
 * react-router v7's `useLocation`.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useLocation
 */
export { useLocation };

/**
 * Like `useLocation`, but returns `null` when rendered outside a router instead
 * of throwing. For code shared between the routed app and the SDK, where the
 * facade router may be absent.
 */
export function useMaybeLocation(): Location | null {
  return useContext(UNSAFE_LocationContext)?.location ?? null;
}
