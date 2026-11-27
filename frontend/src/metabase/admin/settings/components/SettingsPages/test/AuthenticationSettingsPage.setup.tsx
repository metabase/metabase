import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupApiKeyEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
  setupTokenStatusEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { AuthSettingsPageTab } from "metabase/plugins";
import type {
  ApiKey,
  EnterpriseSettingKey,
  EnterpriseSettings,
  Settings,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

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
  tab: AuthSettingsPageTab = "authentication",
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

  return { settings };
};

export type AuthCardCase = {
  name: string;
  cardTestId: string;
  enabledKey: EnterpriseSettingKey;
  configuredKey: EnterpriseSettingKey;
  // a setting that deactivation clears and that the backend derives the configured flag from
  requiredKey: EnterpriseSettingKey;
};

/**
 * The settings endpoints remember writes, and the bulk write derives each
 * card's configured flag from its required setting, the way the backend does.
 */
export const setupStatefulAuthCards = (
  settings: Settings | EnterpriseSettings,
  cards: AuthCardCase[],
) => {
  const store = setupStatefulSettingsEndpoints(settings);
  fetchMock.removeRoute("update-settings");
  fetchMock.put(
    "path:/api/setting",
    ({ options }) => {
      Object.assign(store, JSON.parse(String(options.body)));
      cards.forEach(({ configuredKey, requiredKey }) => {
        store[configuredKey] = store[requiredKey] != null;
      });
      return { status: 204 };
    },
    { name: "update-settings" },
  );
  return store;
};

export const clickCardMenuItem = async (card: HTMLElement, item: string) => {
  await userEvent.click(within(card).getByRole("button", { name: "Actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
};

const findPuts = async (path: string) =>
  (await findRequests("PUT")).filter(
    ({ url }) => new URL(url).pathname === path,
  );

/**
 * Pauses, resumes and deactivates one card, and checks that the other card,
 * which starts out the same, is left alone. Returns the deactivation's body.
 */
export const pauseResumeAndDeactivate = async (
  { cardTestId, enabledKey }: AuthCardCase,
  { cardTestId: otherCardTestId }: AuthCardCase,
) => {
  const card = await screen.findByTestId(cardTestId);
  const otherCard = screen.getByTestId(otherCardTestId);
  expect(within(card).getByTestId("card-badge")).toHaveTextContent("Active");

  await clickCardMenuItem(card, "Pause");
  expect(await within(card).findByText("Paused")).toBeInTheDocument();
  expect(
    (await findPuts(`/api/setting/${enabledKey}`)).map(({ body }) => body),
  ).toEqual([{ value: false }]);

  await clickCardMenuItem(card, "Resume");
  expect(await within(card).findByText("Active")).toBeInTheDocument();
  expect(
    (await findPuts(`/api/setting/${enabledKey}`)).map(({ body }) => body),
  ).toEqual([{ value: false }, { value: true }]);

  await clickCardMenuItem(card, "Deactivate");
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Deactivate",
    }),
  );
  expect(
    await within(card).findByRole("button", { name: "Set up" }),
  ).toBeInTheDocument();
  expect(within(card).queryByTestId("card-badge")).not.toBeInTheDocument();
  const deactivations = await findPuts("/api/setting");
  expect(deactivations).toHaveLength(1);

  expect(within(otherCard).getByTestId("card-badge")).toHaveTextContent(
    "Active",
  );
  expect(
    within(otherCard).getByRole("button", { name: "Edit" }),
  ).toBeInTheDocument();

  return deactivations[0].body;
};
