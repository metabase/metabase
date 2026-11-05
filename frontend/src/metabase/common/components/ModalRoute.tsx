import { useCallback } from "react";

import type { Location, RouteObject } from "metabase/router";
import { Route, useLocation, useNavigate, useParams } from "metabase/router";

type RouteParams = Record<string, string | undefined>;

/**
 * Base props any modal rendered by `modalRoute` must accept. Modals typically
 * narrow `params` to specific keys (e.g. `{ alertId?: string }`), but they have
 * to accept the full shape.
 */
export type ModalComponentProps = {
  params: RouteParams;
  location: Location;
  onClose: () => void;
};

export type ModalComponent = React.ComponentType<ModalComponentProps>;

export type ModalRouteOptions = {
  closeTo?: string;
};

/**
 * Declare a modal as a child route of the page it opens over: the page stays
 * mounted underneath, and closing the modal returns to the page's URL.
 *
 * `onClose` is wired here rather than left to each modal, so no modal has to
 * work out its own parent URL.
 */
export function modalRoute(
  path: string,
  ComposedModal: ModalComponent,
  options: ModalRouteOptions = {},
) {
  const ModalRouteComponent = createModalRouteComponent(ComposedModal, options);

  // Keyed for the plugin route arrays, which React renders as a list.
  return <Route key={path} path={path} element={<ModalRouteComponent />} />;
}

/**
 * `modalRoute` for a modal that lives in a code-split chunk, for a route tree
 * still authored as `<Route>` elements. `createRoutesFromElements` reads `lazy`
 * off the element, so this defers the modal without the tree having to convert.
 */
export function lazyModalRouteElement(
  path: string,
  loadModal: () => Promise<ModalComponent>,
  options: ModalRouteOptions = {},
) {
  return (
    <Route
      key={path}
      path={path}
      lazy={lazyModalRouteComponent(loadModal, options)}
    />
  );
}

/**
 * `modalRoute` for a modal that lives in a code-split chunk.
 *
 * `route.lazy` cannot supply `children`, so a lazy page's modal children have to
 * be route objects of their own. This keeps the path static, which is what
 * matching needs, and defers only the modal itself.
 */
export function lazyModalRoute(
  path: string,
  loadModal: () => Promise<ModalComponent>,
  options: ModalRouteOptions = {},
): RouteObject {
  return {
    path,
    lazy: lazyModalRouteComponent(loadModal, options),
  };
}

/**
 * A route `lazy` function that loads a code-split modal and renders it as a
 * modal route. Use it for route objects `lazyModalRoute` can't express, such
 * as index routes.
 */
export function lazyModalRouteComponent(
  loadModal: () => Promise<ModalComponent>,
  options: ModalRouteOptions = {},
) {
  return async () => ({
    Component: createModalRouteComponent(await loadModal(), options),
  });
}

function createModalRouteComponent(
  ComposedModal: ModalComponent,
  { closeTo = ".." }: ModalRouteOptions,
) {
  function ModalRouteComponent() {
    const params = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const onClose = useCallback(
      () => navigate(closeTo, { relative: "route" }),
      [navigate],
    );

    return (
      <ComposedModal params={params} location={location} onClose={onClose} />
    );
  }

  ModalRouteComponent.displayName = `ModalRoute[${
    ComposedModal.displayName || ComposedModal.name
  }]`;

  return ModalRouteComponent;
}
