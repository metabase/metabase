import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupDatabasesEndpoints,
  setupEmailEndpoints,
  setupGroupsEndpoint,
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
  setupSlackManifestEndpoint,
  setupTokenStatusEndpoint,
  setupUploadManagementEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { getSettingsRoutes } from "metabase/admin/settingsRoutes";
import type { TokenFeature, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

type RouteMap = Record<
  string,
  { path: string; testPattern: RegExp; role?: string }
>;

export const ossRoutes: RouteMap = {
  root: { path: "", testPattern: /site name/i },
  general: { path: "/general", testPattern: /site name/i },
  email: { path: "/email", testPattern: /SMTP/i },
  notifications: { path: "/notifications", testPattern: /Connect to Slack/i },
  authentication: {
    path: "/authentication",
    testPattern: /Sign in with Google/i,
  },
  google: {
    path: "/authentication/google",
    testPattern: /application client ID/i,
  },
  ldap: { path: "/authentication/ldap", testPattern: /Server Settings/i },
  apiKeys: {
    path: "/authentication/api-keys",
    testPattern: /Allow users to use API keys/i,
  },
  maps: { path: "/maps", testPattern: /Map tile server URL/i },
  localization: { path: "/localization", testPattern: /Instance language/i },
  uploads: {
    path: "/uploads",
    testPattern: /Allow people to upload data to Collections/i,
  },
  publicSharing: {
    path: "/public-sharing",
    testPattern: /Enable Public Sharing/i,
  },
  license: { path: "/license", testPattern: /Looking for more/i },
  appearance: {
    path: "/appearance",
    testPattern: /Make Metabase look like you/i,
  },
  cloud: { path: "/cloud", testPattern: /Migrate to Metabase Cloud/i },
};

export const enterpriseRoutes: RouteMap = {
  license: { path: "/license", testPattern: /License/i, role: "heading" },
};

export const premiumRoutes: RouteMap = {
  saml: { path: "/authentication/saml", testPattern: /Set up SAML-based SSO/i },
  jwt: { path: "/authentication/jwt", testPattern: /Server Settings/i },
};

export const upsellRoutes: RouteMap = {
  appearance: { path: "/whitelabel", testPattern: /Color palette/i },
  branding: { path: "/whitelabel/branding", testPattern: /Color palette/i },
  concealMetabase: {
    path: "/whitelabel/conceal-metabase",
    testPattern: /Application Name/i,
  },
};

export const routeObjtoArray = (map: RouteMap) => {
  return Object.entries(map).map(([name, { path, testPattern, role }]) => ({
    name,
    path,
    testPattern,
    role,
  }));
};

export const setup = async ({
  enterprisePlugins,
  hasTokenFeatures = false,
  isAdmin = true,
  features = {},
  initialRoute = "",
}: {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][] | "*";
  hasTokenFeatures?: boolean;
  isAdmin?: boolean;
  features?: Partial<TokenFeatures>;
  initialRoute?: string;
}) => {
  const tokenFeatures = createMockTokenFeatures({});
  if (hasTokenFeatures) {
    // all or nothing token features
    Object.keys(tokenFeatures).forEach((feature) => {
      tokenFeatures[feature as TokenFeature] = true;
    });
  }
  const settings = createMockSettings({
    "has-user-setup": true,
    "token-features": {
      ...tokenFeatures,
      ...features,
    },
  });
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: settings["version-info"],
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupEmailEndpoints();
  setupWebhookChannelsEndpoint();
  setupApiKeyEndpoints([]);
  setupGroupsEndpoint([]);
  setupDatabasesEndpoints([]);
  setupSlackManifestEndpoint();
  setupUploadManagementEndpoint([]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  fetchMock.get("path:/api/cloud-migration", { status: 204 });
  fetchMock.get("path:/api/ee/sso/oidc", []);

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const store = createMockState({
    currentUser: user,
    settings: mockSettings(settings),
  });

  if (enterprisePlugins) {
    if (enterprisePlugins === "*") {
      setupEnterprisePlugins();
    } else {
      enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
    }
    setupTokenStatusEndpoint({ valid: hasTokenFeatures });
  }

  renderWithProviders(
    <Route path="admin/settings">{getSettingsRoutes()}</Route>,
    {
      storeInitialState: store,
      withRouter: true,
      initialRoute: `/admin/settings${initialRoute}`,
    },
  );

  await screen.findByTestId("admin-layout-content");
};
