import type { ReactNode } from "react";
import { type RouteObject, createRoutesFromElements } from "react-router";

/**
 * A `<Route>` subtree as route objects, so it can be spread into the `children`
 * of a route that is already authored as objects.
 *
 * Route trees are being converted top down, and there is no way back: a route
 * object cannot be rendered as a `<Route>` element. So a parent that has
 * converted uses this on every subtree that has not.
 */
export function toRouteObjects(tree: ReactNode): RouteObject[] {
  return withDerivedIds(createRoutesFromElements(tree));
}

/**
 * Drop the `id` that `createRoutesFromElements` derives from a route's position
 * in the tree it was given. Those ids reach the router as explicit ones, and
 * every call starts numbering at "0", so two converted subtrees under one router
 * collide. Without them the router derives ids from the whole tree, as it does
 * for a tree that was authored as objects throughout.
 */
function withDerivedIds(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) =>
    route.index
      ? { ...route, id: undefined }
      : {
          ...route,
          id: undefined,
          children: route.children && withDerivedIds(route.children),
        },
  );
}
