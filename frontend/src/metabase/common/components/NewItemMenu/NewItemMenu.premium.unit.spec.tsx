import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import NewItemMenu from "./NewItemMenu";

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  isAdmin?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();

async function setup({
  databases = [SAMPLE_DATABASE],
  tokenFeatures,
  isAdmin = true,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupDatabasesEndpoints(databases);
  setupEnterprisePlugins();
  setupPropertiesEndpoints(createMockSettings());

  renderWithProviders(<NewItemMenu trigger={<button>New</button>} />, {
    storeInitialState: createMockState({
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });

  await userEvent.click(screen.getByText("New"));
}

describe("NewItemMenu (EE with token)", () => {
  beforeEach(() => {
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the Embed item when user is an admin", async () => {
    await setup({
      tokenFeatures: { embedding_simple: true },
      isAdmin: true,
    });

    expect(await screen.findByText("Embed")).toBeInTheDocument();
  });

  it("hides the Embed item when user is non-admin", async () => {
    await setup({
      tokenFeatures: { embedding_simple: true },
      isAdmin: false,
    });

    expect(screen.queryByText("Embed")).not.toBeInTheDocument();
  });
});
