import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { Route } from "metabase/router";
import type { Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NewModals } from "./NewModals";

console.warn = jest.fn();
console.error = jest.fn();

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
  canWrite?: boolean;
  isConfigured?: boolean;
  aiFeaturesEnabled?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();
const COLLECTION = createMockCollection();

async function setup({
  databases = [SAMPLE_DATABASE],
  canWrite = true,
  isConfigured = true,
  aiFeaturesEnabled = true,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": true,
    "ai-features-enabled?": aiFeaturesEnabled,
  });

  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints(databases);
  setupCollectionByIdEndpoint({
    collections: [COLLECTION],
  });
  setupEnterprisePlugins();

  const { store } = renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <NewItemMenu trigger={<button>New</button>} />
          <NewModals />
        </>
      }
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({
          permissions: createMockUserPermissions({
            can_create_queries: true,
            can_create_native_queries: true,
          }),
          can_write_any_collection: canWrite,
        }),
      }),
    },
  );
  await userEvent.click(await screen.findByText("New"));

  return { store };
}

describe("NewItemMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should properly render menu items", async () => {
    setup();
    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("shows AI exploration when NLQ access exists but AI is not configured", async () => {
    await setup({ isConfigured: false });

    expect(await screen.findByText("AI exploration")).toBeInTheDocument();
  });

  it("does not show AI exploration when AI features are disabled", async () => {
    await setup({ aiFeaturesEnabled: false });

    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(screen.queryByText("AI exploration")).not.toBeInTheDocument();
  });

  it("should support keyboard navigation", async () => {
    await setup();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /AI exploration/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Question/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: /New dashboard/ }),
    ).toBeInTheDocument();
  });

  describe("navbar collapsing", () => {
    it.each(["Question", "SQL query", "Document"])(
      "should collapse the navbar when creating a new %s",
      async (itemName) => {
        const { store } = await setup();
        expect(store.getState().app.isNavbarOpen).toBe(true);

        await userEvent.click(await screen.findByText(itemName));

        expect(store.getState().app.isNavbarOpen).toBe(false);
      },
    );

    it("should not collapse the navbar when the new dashboard modal is opened and cancelled", async () => {
      const { store } = await setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Cancel" }),
      );

      expect(store.getState().app.isNavbarOpen).toBe(true);
    });

    it("should collapse the navbar once a new dashboard is created", async () => {
      setupCollectionsEndpoints({ collections: [COLLECTION] });
      fetchMock.post("path:/api/dashboard", createMockDashboard({ id: 42 }));
      const { store } = await setup();

      await userEvent.click(await screen.findByText("Dashboard"));
      expect(store.getState().app.isNavbarOpen).toBe(true);

      await userEvent.type(await screen.findByLabelText("Name"), "Sales");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(store.getState().app.isNavbarOpen).toBe(false),
      );
    });
  });

  describe("New Dashboard", () => {
    it("should open new dashboard modal on click", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      const modal = await screen.findByRole("dialog");
      expect(modal).toHaveTextContent("New dashboard");
    });

    it("should not be available if the user has no write permissions to collection", async () => {
      await setup({ canWrite: false });
      expect(await screen.findByText("Question")).toBeInTheDocument();
      expect(await screen.findByText("SQL query")).toBeInTheDocument();
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    });
  });
});
