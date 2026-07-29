import { useContext } from "react";
import {
  type Location,
  UNSAFE_LocationContext,
  useLocation,
} from "react-router";

/**
 * react-router v7's `useLocation`. Returns the pure v7 `Location` shape (no v3
 * `query`/`action` fields); the legacy compat `Location` type carries those for
 * the route-prop call sites.
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
