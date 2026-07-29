import type { ComponentType } from "react";

import { useRoute } from "./Outlet";
import type { Route } from "./route";
import type { InjectedRouter, Location, Params, PlainRoute } from "./types";
import { useRouter } from "./use-router";

/**
 * The v3 router props a wrapped component may read. `params`/`location` are
 * always injected; the rest are optional so a component that reads only a subset
 * still satisfies the constraint.
 */
export interface InjectedRouteProps {
  params: Params;
  location: Location;
  route?: Route;
  router?: InjectedRouter;
  routes?: PlainRoute[];
}

/**
 * Temporary shim for the react-router v7 migration. Wraps a legacy component
 * that still reads the v3-injected router props (`params`, `location`, `route`,
 * `router`, `routes`) and feeds them in from the router context, so the
 * component runs as an `element` route without being rewritten. Removed in
 * Phase 4 once these components read the hooks themselves.
 */
export function withRouteProps<Props extends object>(
  WrappedComponent: ComponentType<Props>,
): ComponentType<Omit<Props, keyof InjectedRouteProps>> {
  function WithRouteProps(props: Omit<Props, keyof InjectedRouteProps>) {
    const { router, location, params, routes } = useRouter();
    const route = useRoute();

    // TS cannot see that re-adding the omitted route props reconstructs `Props`.
    const injectedProps = {
      ...props,
      router,
      location,
      params,
      routes,
      route,
    } as unknown as Props;
    return <WrappedComponent {...injectedProps} />;
  }

  const wrappedName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? "Component";
  WithRouteProps.displayName = `withRouteProps(${wrappedName})`;

  return WithRouteProps;
}
