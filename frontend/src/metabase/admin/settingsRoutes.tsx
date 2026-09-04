import type { Store } from "@reduxjs/toolkit";

import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_DATA_APPS,
  PLUGIN_MULTI_FACTOR_AUTH,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Outlet, Route, type RouteComponent, redirect } from "metabase/router";
import { getSetting } from "metabase/settings";
import * as Urls from "metabase/urls";

/**
 * The admin settings pages, in one chunk. Every loader names it, so the section
 * arrives in a single request rather than one per page.
 *
 * This module holds paths and `import()` calls, so the admin route tree can name
 * it eagerly while none of the pages are in the initial bundle. They are fetched
 * the first time one of these routes is matched.
 *
 * The nav and the layout load together with the first page rather than ahead of
 * it: they are only ever seen inside this section, so there is nothing to gain
 * from splitting them apart.
 */
const settingsLayout = () =>
  Promise.all([
    import(
      /* webpackChunkName: "admin-settings" */ "metabase/admin/components/AdminLayout/AdminSettingsLayout"
    ),
    import(
      /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsNav"
    ),
  ]).then(([{ AdminSettingsLayout }, { SettingsNav }]) => ({
    Component: function AdminSettingsLayoutRoute() {
      return (
        <AdminSettingsLayout sidebar={<SettingsNav />}>
          <Outlet />
        </AdminSettingsLayout>
      );
    },
  }));

const generalSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/GeneralSettingsPage"
  ).then(({ GeneralSettingsPage }) => ({ Component: GeneralSettingsPage }));

const updatesSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/UpdatesSettingsPage"
  ).then(({ UpdatesSettingsPage }) => ({ Component: UpdatesSettingsPage }));

const emailSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/EmailSettingsPage"
  ).then(({ EmailSettingsPage }) => ({ Component: EmailSettingsPage }));

const slackSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/SlackSettingsPage"
  ).then(({ SlackSettingsPage }) => ({ Component: SlackSettingsPage }));

const webhooksSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/WebhooksSettingsPage"
  ).then(({ WebhooksSettingsPage }) => ({ Component: WebhooksSettingsPage }));

// `route.lazy` supplies a component and no props, so the routes that share this
// page bind their tab here.
const authenticationSettings =
  (tab: "authentication" | "user-provisioning" | "api-keys") => () =>
    import(
      /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/AuthenticationSettingsPage"
    ).then(({ AuthenticationSettingsPage }) => ({
      Component: function AuthenticationSettingsRoute() {
        return <AuthenticationSettingsPage tab={tab} />;
      },
    }));

const googleAuth = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/auth/components/GoogleAuthForm"
  ).then(({ GoogleAuthForm }) => ({ Component: GoogleAuthForm }));

const ldapAuth = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsLdapForm"
  ).then(({ SettingsLdapForm }) => ({ Component: SettingsLdapForm }));

const domainsSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/DomainsSettingsPage"
  ).then(({ DomainsSettingsPage }) => ({ Component: DomainsSettingsPage }));

const remoteSyncSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/RemoteSyncSettingsPage"
  ).then(({ RemoteSyncSettingsPage }) => ({
    Component: RemoteSyncSettingsPage,
  }));

const mapsSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/MapsSettingsPage"
  ).then(({ MapsSettingsPage }) => ({ Component: MapsSettingsPage }));

const localizationSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/LocalizationSettingsPage"
  ).then(({ LocalizationSettingsPage }) => ({
    Component: LocalizationSettingsPage,
  }));

const customVisualizationsManage = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/CustomVisualizationsSettingsPage"
  ).then(({ CustomVisualizationsManagePage }) => ({
    Component: CustomVisualizationsManagePage,
  }));

const customVisualizationsForm = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/CustomVisualizationsSettingsPage"
  ).then(({ CustomVisualizationsFormPage }) => ({
    Component: CustomVisualizationsFormPage,
  }));

const customVisualizationsDevelopment = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/CustomVisualizationsSettingsPage"
  ).then(({ CustomVisualizationsDevelopmentPage }) => ({
    Component: CustomVisualizationsDevelopmentPage,
  }));

const dataAppsManage = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/DataAppsSettingsPage"
  ).then(({ DataAppsManagePage }) => ({ Component: DataAppsManagePage }));

const uploadSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/UploadSettingsPage"
  ).then(({ UploadSettingsPage }) => ({ Component: UploadSettingsPage }));

const publicSharingSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/PublicSharingSettingsPage"
  ).then(({ PublicSharingSettingsPage }) => ({
    Component: PublicSharingSettingsPage,
  }));

const licenseSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/LicenseSettingsPage"
  ).then(({ LicenseSettingsPage }) => ({ Component: LicenseSettingsPage }));

/** The `appearance` page, opened on one of its tabs. */
const appearanceSettings = (tab?: "branding" | "conceal-metabase") => () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/AppearanceSettingsPage"
  ).then(({ AppearanceSettingsPage }) => ({
    Component: function AppearanceSettingsRoute() {
      return <AppearanceSettingsPage tab={tab} />;
    },
  }));

const cloudSettings = () =>
  import(
    /* webpackChunkName: "admin-settings" */ "./settings/components/SettingsPages/CloudSettingsPage"
  ).then(({ CloudSettingsPage }) => ({ Component: CloudSettingsPage }));

export const getSettingsRoutes = (
  store: Store<State>,
  IsAdmin: RouteComponent,
) => {
  const devModeEnabled = getSetting(
    store.getState(),
    "custom-viz-plugin-dev-mode-enabled",
  );

  return (
    <Route lazy={settingsLayout}>
      <Route index element={redirect("general")} />
      <Route path="general" lazy={generalSettings} />
      <Route path="updates" lazy={updatesSettings} />
      <Route path="email" lazy={emailSettings} />
      <Route path="slack" lazy={slackSettings} />
      <Route path="webhooks" lazy={webhooksSettings} />
      <Route
        path="authentication"
        lazy={authenticationSettings("authentication")}
      />
      <Route
        path="authentication/user-provisioning"
        lazy={authenticationSettings("user-provisioning")}
      />
      <Route
        path="authentication/api-keys"
        lazy={authenticationSettings("api-keys")}
      />
      <Route path="authentication/2fa" element={<IsAdmin />}>
        <Route
          path="enrolled"
          lazy={PLUGIN_MULTI_FACTOR_AUTH.enrolledUsersPage}
        />
        <Route
          path="unenrolled"
          lazy={PLUGIN_MULTI_FACTOR_AUTH.unenrolledUsersPage}
        />
      </Route>
      <Route path="authentication/google" lazy={googleAuth} />
      <Route path="authentication/ldap" lazy={ldapAuth} />
      <Route
        path="authentication/saml"
        lazy={PLUGIN_AUTH_PROVIDERS.settingsSAMLForm}
      />
      <Route
        path="authentication/jwt"
        lazy={PLUGIN_AUTH_PROVIDERS.settingsJWTForm}
      />
      <Route
        path="authentication/oidc"
        lazy={PLUGIN_AUTH_PROVIDERS.settingsOIDCForm}
      />
      <Route path="domains" lazy={domainsSettings} />
      <Route path="remote-sync" lazy={remoteSyncSettings} />
      <Route path="maps" lazy={mapsSettings} />
      <Route path="localization" lazy={localizationSettings} />
      <Route
        path="custom-visualizations"
        /* do not allow users with "Settings access" permissions to access custom viz pages */
        element={<IsAdmin />}
      >
        <Route index lazy={customVisualizationsManage} />
        <Route path="new" lazy={customVisualizationsForm} />
        <Route path="edit/:id" lazy={customVisualizationsForm} />
        {devModeEnabled && (
          <Route path="development" lazy={customVisualizationsDevelopment} />
        )}
      </Route>
      {/* TODO(v65): data apps launch in v65 — drop the isEnabled gate then so the
          page shows the upsell without the token feature instead of 404ing */}
      {PLUGIN_DATA_APPS.isEnabled && (
        <Route
          path={
            Urls.DATA_APP_URL_SEGMENT
          } /* do not allow users with "Settings access" permissions to access data apps pages */
          element={<IsAdmin />}
        >
          <Route index lazy={dataAppsManage} />
        </Route>
      )}
      <Route path="uploads" lazy={uploadSettings} />
      <Route
        path="python-runner"
        lazy={PLUGIN_TRANSFORMS_PYTHON.pythonRunnerSettingsPage}
      />
      <Route path="public-sharing" lazy={publicSharingSettings} />
      <Route path="license" lazy={licenseSettings} />
      <Route path="appearance" lazy={appearanceSettings()} />
      <Route path="whitelabel" lazy={appearanceSettings("branding")} />
      <Route path="whitelabel/branding" lazy={appearanceSettings("branding")} />
      <Route
        path="whitelabel/conceal-metabase"
        lazy={appearanceSettings("conceal-metabase")}
      />
      <Route path="cloud" lazy={cloudSettings} />
      <Route path="*" element={<NotFound />} />
    </Route>
  );
};
