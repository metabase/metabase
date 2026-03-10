import { IndexRedirect, Route } from "react-router";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";

import { GoogleAuthForm } from "./settings/auth/components/GoogleAuthForm";
import { SettingsLdapForm } from "./settings/components/SettingsLdapForm";
import { SettingsNav } from "./settings/components/SettingsNav";
import { AppearanceSettingsPage } from "./settings/components/SettingsPages/AppearanceSettingsPage";
import { AuthenticationSettingsPage } from "./settings/components/SettingsPages/AuthenticationSettingsPage";
import { CloudSettingsPage } from "./settings/components/SettingsPages/CloudSettingsPage";
import { EmailSettingsPage } from "./settings/components/SettingsPages/EmailSettingsPage";
import { GeneralSettingsPage } from "./settings/components/SettingsPages/GeneralSettingsPage";
import { LicenseSettingsPage } from "./settings/components/SettingsPages/LicenseSettingsPage";
import { LocalizationSettingsPage } from "./settings/components/SettingsPages/LocalizationSettingsPage";
import { MapsSettingsPage } from "./settings/components/SettingsPages/MapsSettingsPage";
import { NotificationSettingsPage } from "./settings/components/SettingsPages/NotificationSettingsPage";
import { PublicSharingSettingsPage } from "./settings/components/SettingsPages/PublicSharingSettingsPage";
import { UpdatesSettingsPage } from "./settings/components/SettingsPages/UpdatesSettingsPage";
import { UploadSettingsPage } from "./settings/components/SettingsPages/UploadSettingsPage";

export const getSettingsRoutes = () => (
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
    <Route path="notifications" component={NotificationSettingsPage} />
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
