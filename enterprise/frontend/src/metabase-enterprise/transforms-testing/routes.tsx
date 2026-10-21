import { Route } from "metabase/router";

const testListPage = () =>
  import(
    /* webpackChunkName: "transforms-testing" */ "./pages/TransformTestListPage"
  ).then(({ TransformTestListPage }) => ({
    Component: TransformTestListPage,
  }));

export function getTransformTestRoutes() {
  return <Route path=":transformId/tests" lazy={testListPage} />;
}
