import { Route } from "metabase/router";

import { SettingsPage } from "./pages/SettingsPage";

export function getDataStudioSettingsRoutes() {
  return <Route path="settings" element={<SettingsPage />} />;
}
