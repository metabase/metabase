import { Navigate, Outlet, type RouteObject } from "react-router-dom";

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

export const getSettingsRoutes = () => null;

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
