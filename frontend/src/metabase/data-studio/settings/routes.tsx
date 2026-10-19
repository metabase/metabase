import { Route } from "metabase/router";

const settingsPage = () =>
  import(
    /* webpackChunkName: "data-studio-settings" */ "./pages/SettingsPage"
  ).then(({ SettingsPage }) => ({ Component: SettingsPage }));

export function getDataStudioSettingsRoutes() {
  return <Route path="settings" lazy={settingsPage} />;
}
