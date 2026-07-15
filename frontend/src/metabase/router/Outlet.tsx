import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

const OutletContext = createContext<ReactNode>(null);

/**
 * react-router v7's `<Outlet>`: renders the matched child route (or nothing when
 * there is none). On v3 the child is injected as `props.children`, which
 * `withOutlet` exposes through context.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Outlet
 */
export function Outlet(): JSX.Element {
  const child = useContext(OutletContext);
  return <>{child}</>;
}

/**
 * Wraps a v7-style component so it can be used as a react-router v3 route
 * `component`. The child route that v3 injects as `props.children` is exposed
 * through context, letting the wrapped component render it with `<Outlet/>`.
 */
export function withOutlet(
  Component: ComponentType,
): ComponentType<{ children?: ReactNode }> {
  return function RouteWithOutlet({ children }) {
    return (
      <OutletContext.Provider value={children}>
        <Component />
      </OutletContext.Provider>
    );
  };
}
