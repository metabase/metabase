import { useContext } from "react";
import {
  UNSAFE_NavigationContext,
  useNavigate as useRouterNavigate,
} from "react-router";

import { navigate } from "./navigator";
import type { NavigateFunction } from "./types";

/**
 * Like react-router's `useNavigate`, but falls back to the module-level
 * `navigate` when rendered outside a router instead of throwing.
 *
 * Much of the app is shared with the SDK, which mounts no router (see
 * `useMaybeLocation`, which exists for the same reason). Navigation used to run
 * through redux, which had no opinion on whether a router was mounted, so
 * components rendered in both places never had to care. Keeping that means a
 * router-less render is a no-op rather than a crash.
 */
export function useNavigate(): NavigateFunction {
  const hasRouter = useContext(UNSAFE_NavigationContext) != null;

  // react-router's hook throws when there is no router, so it can only be called
  // on the branch that has one. Safe despite the rule: a router appearing above
  // a mounted component would change the tree shape and remount it, so
  // `hasRouter` cannot flip between renders of the same mount.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return hasRouter ? useRouterNavigate() : navigate;
}
