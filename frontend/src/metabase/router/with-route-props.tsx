import type { ComponentType } from "react";

import { useLocation } from "./use-location";
import { useParams } from "./use-params";

/**
 * Temporary shim for the react-router v7 migration. Wraps a legacy component
 * that still reads `params` and `location` from props, feeding them in from the
 * facade hooks so the router no longer needs to inject them directly. This lets
 * the engine swap happen without touching the wrapped components. Removed in
 * Phase 4 once they read the hooks themselves.
 */
export function withRouteProps<Props extends object>(
  WrappedComponent: ComponentType<Props>,
): ComponentType<Omit<Props, "params" | "location">> {
  function WithRouteProps(props: Omit<Props, "params" | "location">) {
    const params = useParams();
    const location = useLocation();

    const injectedProps = { ...props, params, location } as Props;
    return <WrappedComponent {...injectedProps} />;
  }

  const wrappedName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? "Component";
  WithRouteProps.displayName = `withRouteProps(${wrappedName})`;

  return WithRouteProps;
}
