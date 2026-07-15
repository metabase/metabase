import {
  type ComponentClass,
  type ReactElement,
  type ReactNode,
  createElement,
} from "react";

import { routeElementToComponent } from "./Outlet";
import {
  type PlainRoute,
  ReactRouterRoute,
  type RouteProps,
  createRoutes,
} from "./react-router";

/**
 * Props accepted by the `<Route>` element. Adds react-router v7's `index` and
 * `element` on top of v3's route props. `index` registers the route as its
 * parent's index route (what v3's `<IndexRoute>` did) and works with either
 * `component` or `element`. `element` is bridged to a v3 `component` that renders
 * it and exposes the matched child through `<Outlet/>`.
 */
// `component` is intentionally omitted: routes must use `element={<X/>}`. The
// bridge still sets a `component` on the built v3 route config internally, and
// the raw v3 `Route` (ReactRouterRoute) remains for the facade's own bootstrap.
export type RouteElementProps = Omit<RouteProps, "component"> & {
  index?: boolean;
  element?: ReactNode;
};

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
      // v3 copies our `element` prop onto the route config but `PlainRoute` does
      // not type it, so widen the result to read it below.
      const [route] = createRoutes(createElement(ReactRouterRoute, props)) as [
        (PlainRoute & { element?: ReactNode }) | undefined,
      ];

      // Bridge `element` onto v3: render it through a `component` that publishes
      // the matched child on `<Outlet/>`'s context. The `element` stays on the
      // route config so the bridge component can render it off the injected
      // `route` prop, letting sibling routes that share a component reconcile
      // instead of remounting. Goes away at the engine swap.
      if (route?.element != null) {
        route.component = routeElementToComponent(route.element);
      }

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
