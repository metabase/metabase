import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { NewModals } from "metabase/new/components/NewModals/NewModals";
import { createMockState } from "metabase/redux/store/mocks";
import type { Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NewItemMenu } from "./NewItemMenu";

console.warn = jest.fn();
console.error = jest.fn();

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
  canWrite?: boolean;
  isConfigured?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();
const COLLECTION = createMockCollection();

async function setup({
  databases = [SAMPLE_DATABASE],
  canWrite = true,
  isConfigured = true,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": true,
  });

  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints(databases);
  setupCollectionByIdEndpoint({
    collections: [COLLECTION],
  });
  setupEnterprisePlugins();

  renderWithProviders(
    <>
      <NewItemMenu trigger={<button>New</button>} />
      <NewModals />
    </>,
    {
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
