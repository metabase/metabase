import { IndexRoute } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}
