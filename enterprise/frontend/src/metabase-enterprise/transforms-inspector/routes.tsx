import { Route, withRouteProps } from "metabase/router";
import { TransformInspectorUpsellPage } from "metabase-enterprise/transforms-python/upsells/PythonTransformsUpsellModal/TransformInspectorUpsellPage";

import { TransformInspectPage } from "./pages/TransformInspectPage";

const RoutedTransformInspectorUpsellPage = withRouteProps(
  TransformInspectorUpsellPage,
);
const RoutedTransformInspectPage = withRouteProps(TransformInspectPage);

export function getInspectorUpsellRoutes() {
  return (
    <>
      <Route
        path=":transformId/inspect"
        element={<RoutedTransformInspectorUpsellPage />}
      />
      <Route
        path=":transformId/inspect/:lensId"
        element={<RoutedTransformInspectorUpsellPage />}
      />
    </>
  );
}

export function getInspectorRoutes() {
  return (
    <>
      <Route
        path=":transformId/inspect"
        element={<RoutedTransformInspectPage />}
      />
      <Route
        path=":transformId/inspect/:lensId"
        element={<RoutedTransformInspectPage />}
      />
    </>
  );
}
