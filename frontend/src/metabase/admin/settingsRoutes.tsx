import { IndexRedirect, IndexRoute, Route } from "react-router";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminContent,
  AdminMain,
  AdminSidebar,
  AdminWrapper,
} from "metabase/components/AdminLayout/AdminLayout.styled";
import { PLUGIN_ADMIN_SETTINGS, PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { CanAccessSettings } from "metabase/route-guards";
import { Box, Flex } from "metabase/ui";

// import { SettingsEditor } from "./settings/app/components/SettingsEditor";
import { GoogleAuthForm } from "./settings/auth/components/GoogleAuthForm";
import { SMTPConnectionForm } from "./settings/components/Email/SMTPConnectionForm";
import { EmbeddingSdkSettings, EmbeddingSettings, StaticEmbeddingSettings } from "./settings/components/EmbeddingSettings";
import { SettingsLdapForm } from "./settings/components/SettingsLdapForm";
import { SettingsLicense } from "./settings/components/SettingsLicense";
import { SettingsNav } from "./settings/components/SettingsNav";
import { AppearanceSettingsPage } from "./settings/components/SettingsPages/AppearanceSettingsPage";
import { AuthenticationSettingsPage } from "./settings/components/SettingsPages/AuthenticationSettingsPage";
import { CloudSettingsPage } from "./settings/components/SettingsPages/CloudSettingsPage";
import { EmailSettingsPage } from "./settings/components/SettingsPages/EmailSettingsPage";
import { GeneralSettingsPage } from "./settings/components/SettingsPages/GeneralSettingsPage";
import { LocalizationSettingsPage } from "./settings/components/SettingsPages/LocalizationSettingsPage";
import { MapsSettingsPage } from "./settings/components/SettingsPages/MapsSettingsPage";
import { PublicSharingSettingsPage } from "./settings/components/SettingsPages/PublicSharingSettingsPage";
import { UpdatesSettingsPage } from "./settings/components/SettingsPages/UpdatesSettingsPage";
import { UploadSettingsPage } from "./settings/components/SettingsPages/UploadSettingsPage";
import { NotificationSettings } from "./settings/notifications/NotificationSettings";
import SlackSettings from "./settings/slack/components/SlackSettings";


function SettingsEditor({ children }: { children: React.ReactNode }) {
  return (
    <AdminWrapper headerHeight={65}>
      <AdminMain>
        <AdminSidebar data-testid="admin-layout-sidebar">
          <SettingsNav />
        </AdminSidebar>
        <AdminContent data-testid="admin-layout-content">
          <ErrorBoundary>
            <Box maw="48rem">
              {children}
            </Box>
          </ErrorBoundary>
        </AdminContent>
      </AdminMain>
    </AdminWrapper>
  )
}

export const settingsRoutes = (
  <Route path="settings" component={CanAccessSettings}>
    <IndexRedirect to="general" />
    <Route component={SettingsEditor}>
      <Route path="general" component={GeneralSettingsPage} />
      <Route path="updates" component={UpdatesSettingsPage} />
      <Route path="email" component={EmailSettingsPage} />
      <Route path="email/smtp" component={SMTPConnectionForm} />
      <Route path="notifications/slack" component={SlackSettings} />
      <Route path="notifications" component={NotificationSettings} />
      <Route path="authentication" component={() => <AuthenticationSettingsPage tab="authentication" />} />
      <Route path="authentication/user-provisioning" component={() => <AuthenticationSettingsPage tab="user-provisioning" />} />
      <Route path="authentication/api-keys" component={() => <AuthenticationSettingsPage tab="api-keys" />} />
      <Route path="authentication/google" component={GoogleAuthForm} />
      <Route path="authentication/ldap" component={SettingsLdapForm} />
      <Route path="authentication/saml" component={() => <PLUGIN_AUTH_PROVIDERS.SettingsSAMLForm />} />
      <Route path="authentication/jwt" component={() => <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />} />
      <Route path="maps" component={MapsSettingsPage} />
      <Route path="localization" component={LocalizationSettingsPage} />
      <Route path="uploads" component={UploadSettingsPage} />
      <Route path="public-sharing" component={PublicSharingSettingsPage} />
      <Route path="embedding-in-other-applications" component={EmbeddingSettings} />
      <Route path="embedding-in-other-applications/standalone" component={StaticEmbeddingSettings} />
      <Route path="embedding-in-other-applications/sdk" component={EmbeddingSdkSettings} />
      <Route
        path="embedding-in-other-applications/full-app"
        component={() => (<PLUGIN_ADMIN_SETTINGS.InteractiveEmbeddingSettings />)}
      />
      <Route path="license" component={SettingsLicense} />
      <Route path="appearance" component={() => <AppearanceSettingsPage />} />
      <Route path="whitelabel" component={() => <AppearanceSettingsPage tab="branding" />} />
      <Route path="whitelabel/branding" component={() => <AppearanceSettingsPage tab="branding" />} />
      <Route path="whitelabel/conceal-metabase" component={() => <AppearanceSettingsPage tab="conceal-metabase" />} />
      <Route path="cloud" component={CloudSettingsPage} />

    </Route>
  </Route>
);

