import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route, withRouteProps } from "metabase/router";
import { NewPythonTransformPage } from "metabase/transforms/pages/NewTransformPage";
import { TransformListPage } from "metabase/transforms/pages/TransformListPage";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonTransformsUpsellModal } from "./upsells/PythonTransformsUpsellModal";

const RoutedPythonLibraryEditorPage = withRouteProps(PythonLibraryEditorPage);
const RoutedNewPythonTransformPage = withRouteProps(NewPythonTransformPage);
const RoutedTransformListPage = withRouteProps(TransformListPage);

export function getPythonTransformsRoutes() {
  return (
    <>
      <Route path="library/:path" element={<RoutedPythonLibraryEditorPage />} />
      <Route path="new/python" element={<RoutedNewPythonTransformPage />} />
    </>
  );
}

export function getPythonUpsellRoutes() {
  return (
    // Render upsell modal on python transforms routes if feature is not enabled
    <Route path="" element={<RoutedTransformListPage />}>
      {modalRoute("library/:path", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
      {modalRoute("new/python", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
    </Route>
  );
}
