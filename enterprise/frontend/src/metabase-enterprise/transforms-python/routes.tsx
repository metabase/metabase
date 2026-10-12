import { lazyModalComponent } from "metabase/common/components/ModalRoute";
import { outletRoute } from "metabase/plugins/components/PluginPlaceholder";
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
 * Without the feature, the transform list renders with the upsell modal over
 * it, so the pathless parent is the list page and each python page gives way
 * to the modal.
 */
const upsellModal = () =>
  lazyModalComponent(async () => PythonTransformsUpsellModal, {
    noWrap: true,
  });

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
      <Route
        path="library/:path"
        lazy={featureGatedRoute(
          "transforms-python",
          pythonLibraryEditorPage,
          upsellModal(),
        )}
      />
      <Route
        path="new/python"
        lazy={featureGatedRoute(
          "transforms-python",
          newPythonTransformPage,
          upsellModal(),
        )}
      />
    </Route>
  );
}
