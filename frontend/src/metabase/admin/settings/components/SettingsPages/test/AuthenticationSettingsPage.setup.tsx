import fetchMock from "fetch-mock";

import {
  setupApiKeyEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupTokenStatusEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { ApiKey, EnterpriseSettings } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { AuthenticationSettingsPage } from "../AuthenticationSettingsPage";

export const testApiKeys: ApiKey[] = [
  {
    name: "Development API Key",
    id: 1,
    group: {
      id: 1,
      name: "All Users",
    },
    creator_id: 1,
    masked_key: "asdfasdfa",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "John Doe",
      id: 10,
    },
  },
  {
    name: "Production API Key",
    id: 2,
    group: {
      id: 2,
      name: "Administrators",
    },
    creator_id: 1,
    masked_key: "asdfasdfa",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "Jane Doe",
      id: 10,
    },
  },
];

export const setup = async (
  extraSettings?: Partial<EnterpriseSettings>,
  isEnterprise = false,
  tab = "authentication",
) => {
  const settings = createMockSettings({
    "google-auth-enabled": false,
    "ldap-enabled": false,
    "saml-enabled": false,
    "jwt-enabled": false,
    "scim-enabled": false,
    "google-auth-configured": false,
    "ldap-configured?": false, // ⁉️ 🥴 ⁉️
    "saml-configured": false,
    "jwt-configured": false,
    "token-features": createMockTokenFeatures({
      scim: isEnterprise,
      sso_google: isEnterprise,
      sso_saml: isEnterprise,
      sso_jwt: isEnterprise,
      sso_ldap: isEnterprise,
      disable_password_login: isEnterprise,
      session_timeout_config: isEnterprise,
    }),
    ...extraSettings,
  });
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([]);
  setupApiKeyEndpoints(testApiKeys);
  setupTokenStatusEndpoint({ valid: isEnterprise });
  fetchMock.get("path:/api/ee/sso/oidc", []);

  renderWithProviders(
    <div>
      <AuthenticationSettingsPage tab={tab} />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};
