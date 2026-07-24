import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";
import { NewPythonTransformPage } from "metabase/transforms/pages/NewTransformPage";
import { TransformListPage } from "metabase/transforms/pages/TransformListPage";

import { DataIngestionPage } from "./pages/DataIngestionPage";
import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonTransformsUpsellModal } from "./upsells/PythonTransformsUpsellModal";

export function getPythonTransformsRoutes() {
  return (
    <>
      <Route path="library/:path" element={<PythonLibraryEditorPage />} />
      <Route path="new/python" element={<NewPythonTransformPage />} />
      <Route path="ingestion" element={<DataIngestionPage />} />
    </>
  );
}

export function getPythonUpsellRoutes() {
  return (
    // Render upsell modal on python transforms routes if feature is not enabled
    <Route path="" element={<TransformListPage />}>
      {modalRoute("library/:path", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
      {modalRoute("new/python", PythonTransformsUpsellModal, {
        noWrap: true,
      })}
    </Route>
  );
}
