import { type JSX, useEffect } from "react";
import { Outlet, useNavigate } from "react-router";

import { setRouterNavigate } from "./navigator";
import { RouteLeaveGuards } from "./route-leave-guards";
import { useScrollRestoration } from "./use-scroll-restoration";

/**
 * The element of the host's pathless layout route.
 *
 * It registers the router's `navigate` for the module-level `navigate`, the
 * hatch that non-component code navigates through. Registering from here rather
 * than from the router object matters for a relative target: `router.navigate`
 * resolves it against the deepest matched route, while this route contributes no
 * path and so resolves from the root. That hatch carries no route context of its
 * own, so the root is the only sensible base.
 *
 * It also owns the router's single blocker, which the route-leave guards share,
 * and scroll restoration across navigations.
 */
export function AppShell(): JSX.Element {
  const navigate = useNavigate();
  useScrollRestoration();

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
