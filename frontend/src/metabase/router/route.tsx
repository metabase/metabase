import type { ComponentClass, ReactNode } from "react";

import type { RouteProps } from "./types";

/**
 * Props accepted by the `<Route>` element: react-router v7's `index` and
 * `element` on top of the shared route props. `index` registers the route as its
 * parent's index route.
 */
export type RouteElementProps = Omit<RouteProps, "component"> & {
  index?: boolean;
  element?: ReactNode;
};

/**
 * The route object type, preserved for the call sites that annotate the injected
 * `route` prop with `Route`.
 */
export type Route = ComponentClass<RouteProps>;

/**
 * react-router v7's `<Route>`. Like v3's it is route configuration and never
 * renders: `mapToV7` reads its props and rebuilds the tree as real v7 routes.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Route
 */
export function Route(_props: RouteElementProps): null {
  throw new Error(
    "<Route> configures the route tree and is never rendered directly",
  );
}
