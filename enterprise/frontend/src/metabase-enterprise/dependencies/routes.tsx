import { IndexRoute } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDependencyGraphRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}
