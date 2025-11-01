import { IndexRoute } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getBenchRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}
