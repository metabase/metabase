import type { ComponentClass, ReactElement } from "react";

import {
  type PlainRoute,
  type RouteProps,
  createRouteFromReactElement,
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
      if (element.props.index) {
        if (parentRoute) {
          parentRoute.indexRoute = createRouteFromReactElement(element);
        }
        return undefined;
      }
      return createRouteFromReactElement(element);
    },
  },
);
