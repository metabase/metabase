import { Route } from "react-router";

import { TransformInspectorUpsellPage } from "./TransformInspectorUpsellPage";

export function getDefaultInspectorRoutes() {
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
