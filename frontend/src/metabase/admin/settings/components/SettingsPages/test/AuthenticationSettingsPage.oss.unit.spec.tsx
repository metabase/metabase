import fetchMock from "fetch-mock";
import type { ComponentType } from "react";

import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "__support__/state";
import { screen, waitFor, within } from "__support__/ui";
import { apiKeyApi } from "metabase/admin/settings/api/api-key";
import { getSettingsRoutes } from "metabase/admin/settingsRoutes";
import { type RouteObject, toRouteObjects } from "metabase/router";
import { settingsApi } from "metabase/settings/api";
import type { ApiKey } from "metabase-types/api";

import { setup, testApiKeys } from "./AuthenticationSettingsPage.setup";

const [developmentKey, productionKey] = testApiKeys;

function createApiKeys(count: number): ApiKey[] {
  return Array.from({ length: count }, (_, index) => ({
    ...productionKey,
    id: index + 1,
    name: `API key ${index + 1}`,
  }));
}

function findRoute(
  routes: RouteObject[],
  path: string,
): RouteObject | undefined {
  for (const route of routes) {
    if (route.path === path) {
      return route;
    }
    const child = findRoute(route.children ?? [], path);
    if (child) {
      return child;
    }
  }
  return undefined;
}

async function loadSettingsRouteComponent(
  path: string,
): Promise<ComponentType> {
  const store = getStore(mainReducers, { settings: createMockSettingsState() });
  const route = findRoute(toRouteObjects(getSettingsRoutes(store)), path);
  if (typeof route?.lazy !== "function") {
    throw new Error(`No lazy settings route at ${path}`);
  }
  const { Component } = await route.lazy();
  if (!Component) {
    throw new Error(`The settings route at ${path} has no component`);
  }
  return Component;
}

describe("AuthenticationSettingsPage (OSS)", () => {
  it("should render oss auth providers", async () => {
    await setup();

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(await screen.findByText("LDAP")).toBeInTheDocument();
    expect(await screen.findByText("API Keys")).toBeInTheDocument();
  });

  it("should not render EE auth providers", async () => {
    await setup();
    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();

    expect(screen.queryByText(/saml/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jwt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scim/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/User Provisioning/i)).not.toBeInTheDocument();
  });

  it("should render active badges for enabled and configured auth providers", async () => {
    await setup({
      extraSettings: {
        "google-auth-enabled": true,
        "ldap-enabled": true,
        "ldap-configured?": true,
        "google-auth-configured": true,
      },
    });

    expect(await screen.findAllByText("Active")).toHaveLength(2);
  });

  it("should show paused badges for configured but not enabled auth providers", async () => {
    await setup({
      extraSettings: {
        "google-auth-enabled": false,
        "ldap-enabled": false,
        "ldap-configured?": true,
        "google-auth-configured": true,
      },
    });

    expect(await screen.findAllByText("Paused")).toHaveLength(2);
  });

  it("should show the API keys card without a count when there are no keys", async () => {
    const { store } = await setup({ apiKeys: [] });

    const card = await screen.findByTestId("api-keys-setting");
    expect(within(card).getByText("API Keys")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/api-key/count")).toHaveLength(
      1,
    );
    // a count of 0 changes nothing visible, so wait for it before the negative check
    await waitFor(() => {
      expect(
        apiKeyApi.endpoints.countApiKeys.select()(store.getState()).data,
      ).toBe(0);
    });
    expect(within(card).queryByTestId("card-badge")).not.toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Set up" }),
    ).toBeInTheDocument();
  });

  it.each([
    { apiKeys: [developmentKey], badge: "1 API Key" },
    { apiKeys: createApiKeys(3), badge: "3 API Keys" },
  ])(
    "should show the number of API keys on the API keys card ($badge)",
    async ({ apiKeys, badge }) => {
      await setup({ apiKeys });

      const card = await screen.findByTestId("api-keys-setting");
      expect(await within(card).findByTestId("card-badge")).toHaveTextContent(
        new RegExp(`^${badge}$`),
      );
      expect(
        within(card).getByRole("button", { name: "Manage" }),
      ).toBeInTheDocument();
    },
  );

  it("should fall back to the authentication page on the user provisioning route", async () => {
    const UserProvisioningRoute = await loadSettingsRouteComponent(
      "authentication/user-provisioning",
    );
    const { store } = await setup({ page: <UserProvisioningRoute /> });

    expect(await screen.findByTestId("google-setting")).toBeInTheDocument();
    // the page picks its providers from the settings, so wait for them before the negative checks
    await waitFor(() => {
      expect(
        settingsApi.endpoints.getSessionProperties.select()(store.getState())
          .isSuccess,
      ).toBe(true);
    });
    expect(screen.getByTestId("ldap-setting")).toBeInTheDocument();
    expect(screen.getByTestId("api-keys-setting")).toBeInTheDocument();
    expect(screen.queryByTestId("saml-setting")).not.toBeInTheDocument();
    expect(screen.queryByText("User provisioning")).not.toBeInTheDocument();
  });
});
