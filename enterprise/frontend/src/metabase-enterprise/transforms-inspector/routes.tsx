import { Route } from "react-router";

import { TransformInspectPage } from "./pages/TransformInspectPage";

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
