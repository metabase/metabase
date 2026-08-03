import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";

import { setRouterNavigate } from "./navigator";
import { RouteLeaveGuards } from "./route-leave-guards";

/**
 * The element of the host's pathless layout route.
 *
 * It registers the router's `navigate` for the redux navigator adapter, so
 * `dispatch(push(...))` drives the router. Registering from here rather than
 * from the router object matters for a relative target: `router.navigate`
 * resolves it against the deepest matched route, while this route contributes no
 * path and so resolves from the root. Redux navigation carries no route context
 * of its own, and history@3 resolved a relative push against the root, so root
 * is the behavior to keep (`SearchBar` pushes `{ pathname: "search" }`).
 *
 * It also owns the router's single blocker, which the route-leave guards share.
 */
export function AppShell(): JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    setRouterNavigate(navigate);
    return () => setRouterNavigate(null);
  }, [navigate]);

  return (
    <RouteLeaveGuards>
      <Outlet />
    </RouteLeaveGuards>
  );
}
