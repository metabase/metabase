import type { Store } from "@reduxjs/toolkit";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Outlet, Route, type RouteComponent, redirect } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";

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
import { DataAppsManagePage } from "./settings/components/SettingsPages/DataAppsSettingsPage";
import { EmailSettingsPage } from "./settings/components/SettingsPages/EmailSettingsPage";
import { GeneralSettingsPage } from "./settings/components/SettingsPages/GeneralSettingsPage";
import { LicenseSettingsPage } from "./settings/components/SettingsPages/LicenseSettingsPage";
import { LocalizationSettingsPage } from "./settings/components/SettingsPages/LocalizationSettingsPage";
import { MapsSettingsPage } from "./settings/components/SettingsPages/MapsSettingsPage";
import { PublicSharingSettingsPage } from "./settings/components/SettingsPages/PublicSharingSettingsPage";
import { RemoteSyncSettingsPage } from "./settings/components/SettingsPages/RemoteSyncSettingsPage";
import { SlackSettingsPage } from "./settings/components/SettingsPages/SlackSettingsPage";
import { UpdatesSettingsPage } from "./settings/components/SettingsPages/UpdatesSettingsPage";
import { UploadSettingsPage } from "./settings/components/SettingsPages/UploadSettingsPage";
import { WebhooksSettingsPage } from "./settings/components/SettingsPages/WebhooksSettingsPage";

export const getSettingsRoutes = (
  store: Store<State>,
  IsAdmin: RouteComponent,
) => {
  const devModeEnabled = getSetting(
    store.getState(),
    "custom-viz-plugin-dev-mode-enabled",
  );

  return (
    <Route
      element={
        <AdminSettingsLayout sidebar={<SettingsNav />}>
          <Outlet />
        </AdminSettingsLayout>
      }
    >
      <Route index element={redirect("general")} />
      <Route path="general" element={<GeneralSettingsPage />} />
      <Route path="updates" element={<UpdatesSettingsPage />} />
      <Route path="email" element={<EmailSettingsPage />} />
      <Route path="slack" element={<SlackSettingsPage />} />
      <Route path="webhooks" element={<WebhooksSettingsPage />} />
      <Route
        path="authentication"
        element={<AuthenticationSettingsPage tab="authentication" />}
      />
      <Route
        path="authentication/user-provisioning"
        element={<AuthenticationSettingsPage tab="user-provisioning" />}
      />
      <Route
        path="authentication/api-keys"
        element={<AuthenticationSettingsPage tab="api-keys" />}
      />
      <Route path="authentication/google" element={<GoogleAuthForm />} />
      <Route path="authentication/ldap" element={<SettingsLdapForm />} />
      <Route
        path="authentication/saml"
        element={<PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm />}
      />
      <Route
        path="authentication/jwt"
        element={<PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />}
      />
      <Route
        path="authentication/oidc"
        element={<PLUGIN_AUTH_PROVIDERS.SettingsOIDCForm />}
      />
      <Route path="remote-sync" element={<RemoteSyncSettingsPage />} />
      <Route path="maps" element={<MapsSettingsPage />} />
      <Route path="localization" element={<LocalizationSettingsPage />} />
      <Route
        path="custom-visualizations"
        /* do not allow users with "Settings access" permissions to access custom viz pages */
        element={<IsAdmin />}
      >
        <Route index element={<CustomVisualizationsManagePage />} />
        <Route path="new" element={<CustomVisualizationsFormPage />} />
        <Route path="edit/:id" element={<CustomVisualizationsFormPage />} />
        {devModeEnabled && (
          <Route
            path="development"
            element={<CustomVisualizationsDevelopmentPage />}
          />
        )}
      </Route>
      <Route
        path={
          Urls.DATA_APP_URL_SEGMENT
        } /* do not allow users with "Settings access" permissions to access data apps pages */
        element={<IsAdmin />}
      >
        <Route index element={<DataAppsManagePage />} />
      </Route>
      <Route path="uploads" element={<UploadSettingsPage />} />
      <Route
        path="python-runner"
        element={<PLUGIN_TRANSFORMS_PYTHON.PythonRunnerSettingsPage />}
      />
      <Route path="public-sharing" element={<PublicSharingSettingsPage />} />
      <Route path="license" element={<LicenseSettingsPage />} />
      <Route path="appearance" element={<AppearanceSettingsPage />} />
      <Route
        path="whitelabel"
        element={<AppearanceSettingsPage tab="branding" />}
      />
      <Route
        path="whitelabel/branding"
        element={<AppearanceSettingsPage tab="branding" />}
      />
      <Route
        path="whitelabel/conceal-metabase"
        element={<AppearanceSettingsPage tab="conceal-metabase" />}
      />
      <Route path="cloud" element={<CloudSettingsPage />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  );
};
