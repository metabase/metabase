import { Route } from "metabase/router";
import { TransformInspectorUpsellPage } from "metabase-enterprise/transforms-python/upsells/PythonTransformsUpsellModal/TransformInspectorUpsellPage";

import { TransformInspectPage } from "./pages/TransformInspectPage";

export function getInspectorUpsellRoutes() {
  return (
    <>
      <Route
        path=":transformId/inspect"
        element={<TransformInspectorUpsellPage />}
      />
      <Route
        path=":transformId/inspect/:lensId"
        element={<TransformInspectorUpsellPage />}
      />
    </>
  );
}

export function getInspectorRoutes() {
  return (
    <>
      <Route path=":transformId/inspect" element={<TransformInspectPage />} />
      <Route
        path=":transformId/inspect/:lensId"
        element={<TransformInspectPage />}
      />
    </>
  );
}
