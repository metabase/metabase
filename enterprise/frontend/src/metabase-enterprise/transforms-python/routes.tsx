import { createModalRouteComponent } from "metabase/common/components/ModalRoute";
import { outletRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { PythonTransformsUpsellModal } from "./upsells/PythonTransformsUpsellModal";

/**
 * Two of these pages are core transform pages, which the core transform routes
 * load under the `transforms` chunk name. These loaders name a chunk of their
 * own instead: naming an `import()` into a chunk another site already names
 * merges the two module sets, which copies whatever they shared into every
 * other chunk that needs it.
 *
 * The upsell modal stays eager: `modalRoute` takes a component rather than a
 * loader.
 */
const pythonLibraryEditorPage = () =>
  import(
    /* webpackChunkName: "transforms-python" */ "./pages/PythonLibraryEditorPage"
  ).then(({ PythonLibraryEditorPage }) => ({
    Component: PythonLibraryEditorPage,
  }));

const newPythonTransformPage = () =>
  import(
    /* webpackChunkName: "transforms-python" */ "metabase/transforms/pages/NewTransformPage"
  ).then(({ NewPythonTransformPage }) => ({
    Component: NewPythonTransformPage,
  }));

const transformListPage = () =>
  import(
    /* webpackChunkName: "transforms-python" */ "metabase/transforms/pages/TransformListPage"
  ).then(({ TransformListPage }) => ({ Component: TransformListPage }));

/**
 * The upsell modal as a lazy route, so a Python page and its upsell are the two
 * branches of one gated route rather than two tree shapes.
 */
const pythonUpsellModal: PluginRoute = async () => ({
  Component: createModalRouteComponent(PythonTransformsUpsellModal, {
    noWrap: true,
  }),
});

const gated = (enabled: PluginRoute) =>
  featureGatedRoute("transforms-python", enabled, pythonUpsellModal);

/**
 * Without the feature the wrapper renders the transform list and each page
 * below it renders the upsell modal over it. With the feature the wrapper is a
 * plain `Outlet` and each page renders itself.
 */
export function getPythonTransformsRoutes() {
  return (
    <Route
      path=""
      lazy={featureGatedRoute(
        "transforms-python",
        outletRoute,
        transformListPage,
      )}
    >
      <Route path="library/:path" lazy={gated(pythonLibraryEditorPage)} />
      <Route path="new/python" lazy={gated(newPythonTransformPage)} />
    </Route>
  );
}
