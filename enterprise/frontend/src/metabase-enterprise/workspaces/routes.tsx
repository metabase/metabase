import { Route } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";

export function getAdminConnectionInfoRoutes() {
  return <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />;
}
