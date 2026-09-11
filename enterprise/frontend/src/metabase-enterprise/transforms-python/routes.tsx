import {
  type ModalComponentProps,
  modalRoute,
} from "metabase/common/components/ModalRoute";
import { lazyPluginSlot } from "metabase/plugins";
import { Route } from "metabase/router";

/**
 * Two of these pages are core transform pages, which the core transform routes
 * load under the `transforms` chunk name. These loaders name a chunk of their
 * own instead: naming an `import()` into a chunk another site already names
 * merges the two module sets, which copies whatever they shared into every
 * other chunk that needs it.
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

export function getPythonTransformsRoutes() {
  return (
    <>
      <Route path="library/:path" lazy={pythonLibraryEditorPage} />
      <Route path="new/python" lazy={newPythonTransformPage} />
    </>
  );
}

const PythonTransformsUpsellModal = lazyPluginSlot<ModalComponentProps>(() =>
  import("./upsells/PythonTransformsUpsellModal").then(
    ({ PythonTransformsUpsellModal }) => PythonTransformsUpsellModal,
  ),
);

export function getPythonUpsellRoutes() {
  return (
    // Render upsell modal on python transforms routes if feature is not enabled
    <Route path="" lazy={transformListPage}>
      {modalRoute("library/:path", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
      {modalRoute("new/python", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
    </Route>
  );
}
