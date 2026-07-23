import {
  Children,
  Fragment,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from "react";
import { Route as V7Route } from "react-router-v7";

import type { RouteElementProps } from "../route";
import { Route } from "../route";

import { RouterBridge } from "./RouterBridge";

/**
 * Rebuild the facade route tree (`<Route path element>` + `<Outlet/>`, authored
 * in v7 syntax) into a real react-router v7 route tree for `<Routes>`. Paths are
 * already v7-native, so they pass straight through; each `element` is wrapped in a
 * `RouterBridge` that republishes v7 state into the shared context. The v3 form of
 * the path is kept on `handle` so the bridge can hand the facade hooks a v3-shaped
 * `routes` branch (its matcher is v3's). Throwaway: goes away with the v3 engine.
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
  const { path, index, element: routeElement, children, props } = element.props;

  // v7 defaults a route with no `element` to `<Outlet/>`; only wrap (and publish
  // context) when the facade route actually renders something.
  const bridged =
    routeElement !== undefined ? (
      <RouterBridge v3Element={routeElement} />
    ) : undefined;

  // Keep the route `path` and the arbitrary route `props` on `handle`: the
  // matched-route branch the facade republishes exposes both, and consumers read
  // them (`redirect` reads `route.path`, the command palette reads
  // `route.props.disableCommandPalette`).
  const handle = path != null || props != null ? { path, props } : undefined;

  if (index) {
    return <V7Route index element={bridged} handle={handle} />;
  }

  return (
    <V7Route path={path} element={bridged} handle={handle}>
      {mapToV7(children)}
    </V7Route>
  );
}
