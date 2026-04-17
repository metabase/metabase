import { IndexRedirect, IndexRoute, Route } from "react-router";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { IsAdmin } from "metabase/route-guards";
import { getSetting } from "metabase/selectors/settings";

import { GoogleAuthForm } from "./settings/auth/components/GoogleAuthForm";
import { SettingsLdapForm } from "./settings/components/SettingsLdapForm";
import { SettingsNav } from "./settings/components/SettingsNav";
import { AppearanceSettingsPage } from "./settings/components/SettingsPages/AppearanceSettingsPage";
import { AuthenticationSettingsPage } from "./settings/components/SettingsPages/AuthenticationSettingsPage";
import { CloudSettingsPage } from "./settings/components/SettingsPages/CloudSettingsPage";
import {
  CustomVisualizationsDevelopmentPage,
  CustomVisualizationsFormPage,
  CustomVisualizationsManagePage,
} from "./settings/components/SettingsPages/CustomVisualizationsSettingsPage";
import { EmailSettingsPage } from "./settings/components/SettingsPages/EmailSettingsPage";
import { GeneralSettingsPage } from "./settings/components/SettingsPages/GeneralSettingsPage";
import { LicenseSettingsPage } from "./settings/components/SettingsPages/LicenseSettingsPage";
import { LocalizationSettingsPage } from "./settings/components/SettingsPages/LocalizationSettingsPage";
import { MapsSettingsPage } from "./settings/components/SettingsPages/MapsSettingsPage";
import { PublicSharingSettingsPage } from "./settings/components/SettingsPages/PublicSharingSettingsPage";
import { SlackSettingsPage } from "./settings/components/SettingsPages/SlackSettingsPage";
import { UpdatesSettingsPage } from "./settings/components/SettingsPages/UpdatesSettingsPage";
import { UploadSettingsPage } from "./settings/components/SettingsPages/UploadSettingsPage";
import { WebhooksSettingsPage } from "./settings/components/SettingsPages/WebhooksSettingsPage";

export const getSettingsRoutes = (store: Store<State>) => {
  const devModeEnabled = getSetting(
    store.getState(),
    "custom-viz-plugin-dev-mode-enabled",
  );

  return (
    <Route
      component={({ children }) => (
        <AdminSettingsLayout sidebar={<SettingsNav />}>
          {children}
        </AdminSettingsLayout>
      )}
    >
      <IndexRedirect to="general" />
      <Route path="general" component={GeneralSettingsPage} />
      <Route path="updates" component={UpdatesSettingsPage} />
      <Route path="email" component={EmailSettingsPage} />
      <Route path="slack" component={SlackSettingsPage} />
      <Route path="webhooks" component={WebhooksSettingsPage} />
      <Route
        path="authentication"
        component={() => <AuthenticationSettingsPage tab="authentication" />}
      />
      <Route
        path="authentication/user-provisioning"
        component={() => <AuthenticationSettingsPage tab="user-provisioning" />}
      />
      <Route
        path="authentication/api-keys"
        component={() => <AuthenticationSettingsPage tab="api-keys" />}
      />
      <Route path="authentication/google" component={GoogleAuthForm} />
      <Route path="authentication/ldap" component={SettingsLdapForm} />
      <Route
        path="authentication/saml"
        component={() => <PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm />}
      />
      <Route
        path="authentication/jwt"
        component={() => <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />}
      />
      <Route
        path="authentication/oidc"
        component={() => <PLUGIN_AUTH_PROVIDERS.SettingsOIDCForm />}
      />
      <Route
        path="remote-sync"
        component={() => <PLUGIN_REMOTE_SYNC.RemoteSyncSettings />}
      />
      <Route path="maps" component={MapsSettingsPage} />
      <Route path="localization" component={LocalizationSettingsPage} />
      <Route
        path="custom-visualizations"
        /* do not allow users with "Settings access" permissions to access custom viz pages */
        component={IsAdmin}
      >
        <IndexRoute component={CustomVisualizationsManagePage} />
        <Route path="new" component={CustomVisualizationsFormPage} />
        <Route path="edit/:id" component={CustomVisualizationsFormPage} />
        {devModeEnabled && (
          <Route
            path="development"
            component={CustomVisualizationsDevelopmentPage}
          />
        )}
      </Route>
      <Route path="uploads" component={UploadSettingsPage} />
      <Route
        path="python-runner"
        component={PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage}
      />
      <Route path="public-sharing" component={PublicSharingSettingsPage} />
      <Route path="license" component={LicenseSettingsPage} />
      <Route path="appearance" component={() => <AppearanceSettingsPage />} />
      <Route
        path="whitelabel"
        component={() => <AppearanceSettingsPage tab="branding" />}
      />
      <Route
        path="whitelabel/branding"
        component={() => <AppearanceSettingsPage tab="branding" />}
      />
      <Route
        path="whitelabel/conceal-metabase"
        component={() => <AppearanceSettingsPage tab="conceal-metabase" />}
      />
      <Route path="cloud" component={CloudSettingsPage} />
      <Route path="*" component={NotFound} />
    </Route>
  );
};
