import { IndexRedirect } from "react-router";

import { Route } from "metabase/hoc/Title";

import { EmbeddingLayout } from "./layout";
import {
  AppearancePage,
  InteractiveSettingsPage,
  OverviewPage,
  StaticEmbeddingPage,
  UserManagementPage,
} from "./pages";

export const getRoutes = () => (
  <Route path="embedding" component={EmbeddingLayout}>
    <IndexRedirect to="overview" />
    <Route path="overview" component={OverviewPage} />
    <Route path="static" component={StaticEmbeddingPage} />
    <Route path="interactive">
      <Route path="settings" component={InteractiveSettingsPage} />
      <Route path="user-management" component={UserManagementPage} />
    </Route>
    <Route path="appearance" component={AppearancePage} />
  </Route>
);
