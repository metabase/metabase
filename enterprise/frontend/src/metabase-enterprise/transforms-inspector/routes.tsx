import { Route } from "react-router";

import { TransformInspectorUpsellPage } from "metabase-enterprise/transforms-python/upsells/PythonTransformsUpsellModal/TransformInspectorUpsellPage";

import { TransformInspectPage } from "./pages/TransformInspectPage";

export function getInspectorUpsellRoutes() {
  return (
    <>
      <Route
        path=":transformId/inspect"
        component={TransformInspectorUpsellPage}
      />
      <Route
        path=":transformId/inspect/:lensId"
        component={TransformInspectorUpsellPage}
      />
    </>
  );
}

export function getInspectorRoutes() {
  return (
    <>
      <Route path=":transformId/inspect" component={TransformInspectPage} />
      <Route
        path=":transformId/inspect/:lensId"
        component={TransformInspectPage}
      />
    </>
  );
}
