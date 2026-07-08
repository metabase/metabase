import type { ComponentType } from "react";

import type { Location, Params } from "./types";
import { useLocation } from "./use-location";
import { useParams } from "./use-params";

/**
 * The router props injected by the facade hooks into a wrapped component.
 */
export interface InjectedRouteProps {
  params: Params;
  location: Location;
}

/**
 * Temporary shim for the react-router v7 migration. Wraps a legacy component
 * that still reads `params` and `location` from props, feeding them in from the
 * facade hooks so the router no longer needs to inject them directly. This lets
 * the engine swap happen without touching the wrapped components. Removed in
 * Phase 4 once they read the hooks themselves.
 */
export function withRouteProps<Props extends InjectedRouteProps>(
  WrappedComponent: ComponentType<Props>,
): ComponentType<Omit<Props, keyof InjectedRouteProps>> {
  function WithRouteProps(props: Omit<Props, keyof InjectedRouteProps>) {
    const params = useParams();
    const location = useLocation();

    // TS cannot see that re-adding the omitted route props reconstructs `Props`.
    const injectedProps = { ...props, params, location } as Props;
    return <WrappedComponent {...injectedProps} />;
  }

  const wrappedName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? "Component";
  WithRouteProps.displayName = `withRouteProps(${wrappedName})`;

  return WithRouteProps;
}
