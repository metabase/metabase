import { Navigate, Outlet, type RouteObject } from "react-router-dom";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { IndexRedirect, Route } from "metabase/routing/compat/react-router-v3";

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

const SettingsLayoutWithOutlet = () => (
  <AdminSettingsLayout sidebar={<SettingsNav />}>
    <Outlet />
  </AdminSettingsLayout>
);

export const getSettingsRouteObjects = (): RouteObject[] => [
  {
    element: <SettingsLayoutWithOutlet />,
    children: [
      { index: true, element: <Navigate to="general" replace /> },
      { path: "general", element: <GeneralSettingsPage /> },
      { path: "updates", element: <UpdatesSettingsPage /> },
      { path: "email", element: <EmailSettingsPage /> },
      { path: "notifications", element: <NotificationSettingsPage /> },
      {
        path: "authentication",
        element: <AuthenticationSettingsPage tab="authentication" />,
      },
      {
        path: "authentication/user-provisioning",
        element: <AuthenticationSettingsPage tab="user-provisioning" />,
      },
      {
        path: "authentication/api-keys",
        element: <AuthenticationSettingsPage tab="api-keys" />,
      },
      { path: "authentication/google", element: <GoogleAuthForm /> },
      { path: "authentication/ldap", element: <SettingsLdapForm /> },
      {
        path: "authentication/saml",
        element: <PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm />,
      },
      {
        path: "authentication/jwt",
        element: <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />,
      },
      {
        path: "remote-sync",
        element: <PLUGIN_REMOTE_SYNC.RemoteSyncSettings />,
      },
      { path: "maps", element: <MapsSettingsPage /> },
      { path: "localization", element: <LocalizationSettingsPage /> },
      { path: "uploads", element: <UploadSettingsPage /> },
      {
        path: "python-runner",
        element: <PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage />,
      },
      { path: "public-sharing", element: <PublicSharingSettingsPage /> },
      { path: "license", element: <LicenseSettingsPage /> },
      { path: "appearance", element: <AppearanceSettingsPage /> },
      {
        path: "whitelabel",
        element: <AppearanceSettingsPage tab="branding" />,
      },
      {
        path: "whitelabel/branding",
        element: <AppearanceSettingsPage tab="branding" />,
      },
      {
        path: "whitelabel/conceal-metabase",
        element: <AppearanceSettingsPage tab="conceal-metabase" />,
      },
      { path: "cloud", element: <CloudSettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];
