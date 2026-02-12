import { IndexRoute } from "react-router";

import { ReplaceDataSourcePage } from "./pages/ReplaceDataSourcePage";

export function getReplaceDataSourceRoutes() {
  return <IndexRoute component={ReplaceDataSourcePage} />;
}
