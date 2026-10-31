import userEvent from "@testing-library/user-event";

import {
  setupListDataAppsEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { getSettings, settingsApi } from "metabase/settings";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { setup } from "./test-setup";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: () => true,
}));

jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

const setupDataApps = ({
  apps = [
    createMockDataApp({ name: "boba-hq", display_name: "Boba HQ" }),
    createMockDataApp({ name: "sales", display_name: "Sales" }),
  ],
  ...options
}: NonNullable<Parameters<typeof setup>[0]> & { apps?: DataApp[] } = {}) => {
  setupListDataAppsEndpoint(apps);

  return setup({
    modularEmbeddingEnabled: true,
    jwtReady: true,
    dataAppsEnabled: true,
    enterprisePlugins: ["embedding_iframe_sdk_setup", "data-apps"],
    ...options,
  });
};

describe("data app embedding setup", () => {
  const originalRoot = window.MetabaseRoot;

  afterEach(() => {
    window.MetabaseRoot = originalRoot;
    reinitialize();
  });

  it("previews under the current installation subpath", async () => {
    window.MetabaseRoot = "/mb/";
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/mb/embed/apps/sales`,
    );
  });

  it("opens with the data app selected, previews it, and generates its SSO snippet", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    expect(screen.getByRole("radio", { name: /Data App/ })).toBeChecked();
    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Metabase account (SSO)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("enable-embedding-card"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/sales`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));

    const snippet = await screen.findByTestId("embed-code-snippet");
    expect(snippet).toHaveTextContent(
      '<metabase-data-app path="sales"></metabase-data-app>',
    );
    expect(
      screen.queryByRole("radio", {
        name: "Existing session (local testing only)",
      }),
    ).not.toBeInTheDocument();
    expect(snippet).not.toHaveTextContent("useExistingUserSession");
    expect(snippet).not.toHaveTextContent('"isGuest": true');

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
      "Sales",
    );
  });

  it("lets the user select and change data apps from the dropdown", async () => {
    setupDataApps({ initialState: { isGuest: true } });

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Boba HQ",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Get code" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales" }));
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/sales`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Get code" }));
    const snippet = await screen.findByTestId("embed-code-snippet");
    expect(snippet).toHaveTextContent(
      '<metabase-data-app path="sales"></metabase-data-app>',
    );
    expect(snippet).not.toHaveTextContent('"isGuest": true');
  });

  it.each([
    {
      name: "modular embedding is disabled",
      modularEmbeddingEnabled: false,
      showModularEmbedTerms: false,
      button: "Enable and continue",
    },
    {
      name: "modular embedding terms are unaccepted",
      modularEmbeddingEnabled: true,
      showModularEmbedTerms: true,
      button: "Agree and continue",
    },
    {
      name: "modular embedding is disabled and terms are unaccepted",
      modularEmbeddingEnabled: false,
      showModularEmbedTerms: true,
      button: "Agree and enable",
    },
  ])(
    "lets the admin continue when $name",
    async ({ modularEmbeddingEnabled, showModularEmbedTerms, button }) => {
      const { store } = setupDataApps({
        initialState: { resourceType: "data-app", resourceId: "sales" },
        modularEmbeddingEnabled,
        showModularEmbedTerms,
      });

      setupPropertiesEndpoints({
        ...getSettings(store.getState()),
        "enable-embedding-modular": true,
        "show-modular-embed-terms": false,
      });

      // The main app keeps this subscription active so settings refetch after a write.
      const subscription = store.dispatch(
        settingsApi.endpoints.getSessionProperties.initiate(),
      );

      try {
        expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
        expect(
          screen.queryByRole("radio", { name: "Guest" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
        expect(
          screen.queryByRole("radio", { name: "Metabase account (SSO)" }),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: button }));

        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Get code" }),
          ).toBeEnabled(),
        );
        expect(
          screen.queryByTestId("enable-embedding-card"),
        ).not.toBeInTheDocument();
        expect(screen.getByTitle("Data app preview")).toHaveAttribute(
          "src",
          `${window.location.origin}/embed/apps/sales`,
        );
      } finally {
        subscription.unsubscribe();
      }
    },
  );

  it.each([
    { name: "draft", enabled: false, outdated: false },
    { name: "outdated", enabled: true, outdated: true },
  ])("replaces a preselected $name app with a live app", async (state) => {
    const unavailableApp = createMockDataApp({
      ...state,
      display_name: "Unavailable app",
    });

    setupDataApps({
      initialState: {
        resourceType: "data-app",
        resourceId: unavailableApp.name,
      },
      apps: [
        unavailableApp,
        createMockDataApp({ name: "sales", display_name: "Sales" }),
      ],
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/embed/apps/sales`,
    );

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));

    expect(screen.getByRole("option", { name: "Sales" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Unavailable app" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { name: "there are no apps", apps: [] },
    {
      name: "all apps are drafts",
      apps: [createMockDataApp({ enabled: false })],
    },
    {
      name: "all apps are outdated",
      apps: [createMockDataApp({ outdated: true })],
    },
  ])("disables Get code when $name", async ({ apps }) => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "" },
      apps,
    });

    await userEvent.click(screen.getByRole("radio", { name: /Data Apps/ }));
    expect(
      await screen.findByRole("textbox", { name: "Data app" }),
    ).toHaveValue("");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
    expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();
  });

  it("clears a missing preselected app when the loaded app list is empty", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "removed-app" },
      apps: [],
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toBeEnabled(),
    );

    expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue("");
    await waitFor(
      () =>
        expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled(),
      { timeout: 1000 },
    );
    expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();
  });

  it("hides the data app option without the data apps feature", async () => {
    setup();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Change dashboard" }),
      ).toHaveTextContent("Dashboard"),
    );

    expect(
      screen.queryByRole("radio", { name: /Data App/ }),
    ).not.toBeInTheDocument();
  });
});
