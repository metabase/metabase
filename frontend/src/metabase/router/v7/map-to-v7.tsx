import {
  Children,
  Fragment,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from "react";
import { Route as V7Route } from "react-router";

import type { RouteElementProps } from "../route";
import { Route } from "../route";

/**
 * Rebuild the facade route tree (`<Route path element>` + `<Outlet/>`, authored
 * in v7 syntax) into a real react-router v7 route tree for `<Routes>`. Paths are
 * already v7-native, so they pass straight through, and elements render as-is.
 */
export function mapToV7(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) {
      return child;
    }

    // Fragments group sibling routes (plugin interpolation, conditionals); descend
    // so the facade routes inside them get converted too.
    if (child.type === Fragment) {
      return <Fragment>{mapToV7(child.props.children)}</Fragment>;
    }

    if (child.type === Route) {
      // `child.type === Route` guarantees these are the facade Route's props.
      return toV7Route(child as ReactElement<RouteElementProps>);
    }

    // Anything else in a route position is passed through unchanged; v7's
    // `createRoutesFromChildren` validates it.
    return child;
  });
}

function toV7Route(element: ReactElement<RouteElementProps>): ReactElement {
  const { path, index, element: routeElement, children } = element.props;

  // v7 reads `element={null}` as "no element" and falls back to `<Outlet/>`,
  // which would render the route's children. The facade keeps the two apart: an
  // explicit null renders nothing and provides no outlet.
  const routeContent = routeElement === null ? <Fragment /> : routeElement;

  if (index) {
    return <V7Route index element={routeContent} />;
  }

  return (
    <V7Route path={path} element={routeContent}>
      {mapToV7(children)}
    </V7Route>
  );
}
