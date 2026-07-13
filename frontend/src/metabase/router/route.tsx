import { type ComponentClass, type ReactElement, createElement } from "react";

import {
  type PlainRoute,
  ReactRouterRoute,
  type RouteProps,
  createRoutes,
} from "./react-router";

/**
 * Props accepted by the `<Route>` element. Adds react-router v7's `index` on top
 * of v3's route props, so an index route is written `<Route index component={X}/>`
 * instead of the v3 `<IndexRoute>`.
 */
export type RouteElementProps = RouteProps & { index?: boolean };

interface RouteConfigElement {
  (props: RouteElementProps): null;
  createRouteFromReactElement(
    element: ReactElement<RouteElementProps>,
    parentRoute?: PlainRoute,
  ): PlainRoute | undefined;
}

/**
 * The route object type, preserved for the call sites that annotate v3's injected
 * `route` prop with `Route`.
 */
export type Route = ComponentClass<RouteProps>;

/**
 * react-router v7's `<Route>` shape running on the v3 engine. Like v3's `Route` it
 * is route configuration and never renders. It adds support for the v7 `index`
 * prop by registering the element as its parent's index route (what v3's
 * `<IndexRoute>` did); every other prop behaves exactly as v3's `<Route>`.
 *
 * @see https://reactrouter.com/7.18.1/api/components/Route
 */
export const Route: RouteConfigElement = Object.assign(
  function Route(_props: RouteElementProps): null {
    throw new Error(
      "<Route> configures the route tree and is never rendered directly",
    );
  },
  {
    createRouteFromReactElement(
      element: ReactElement<RouteElementProps>,
      parentRoute?: PlainRoute,
    ): PlainRoute | undefined {
      // Rebuild the element as a raw v3 `<Route>` so v3's own builder turns it (and
      // its children) into a route object without dispatching back into this static.
      const { index, ...props } = element.props;
      const [route] = createRoutes(createElement(ReactRouterRoute, props));

      if (index) {
        if (parentRoute && route) {
          parentRoute.indexRoute = route;
        }
        return undefined;
      }
      return route;
    },
  },
);
