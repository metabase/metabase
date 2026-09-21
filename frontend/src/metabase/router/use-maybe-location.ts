import { useContext } from "react";
import { type Location, UNSAFE_LocationContext } from "react-router";

/**
 * Like `useLocation`, but returns `null` when rendered outside a router instead
 * of throwing. For code shared between the routed app and the SDK, where the
 * app's router may be absent.
 */
export function useMaybeLocation(): Location | null {
  return useContext(UNSAFE_LocationContext)?.location ?? null;
}
