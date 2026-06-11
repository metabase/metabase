import { Route } from "react-router";

import { SettingsPage } from "./pages/SettingsPage";

export function getDataStudioSettingsRoutes() {
  return <Route path="settings" component={SettingsPage} />;
}
