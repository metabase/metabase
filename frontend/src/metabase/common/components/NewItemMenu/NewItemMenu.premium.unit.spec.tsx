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
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import NewItemMenu from "./NewItemMenu";

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

const SAMPLE_DATABASE = createSampleDatabase();

async function setup({
  databases = [SAMPLE_DATABASE],
  tokenFeatures,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupDatabasesEndpoints(databases);
  setupEnterprisePlugins();
  setupPropertiesEndpoints(createMockSettings());

  renderWithProviders(<NewItemMenu trigger={<button>New</button>} />, {
    storeInitialState: createMockState({ settings }),
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

  it("shows the Embed item when embedding_iframe_sdk feature is enabled", async () => {
    await setup({ tokenFeatures: { embedding_iframe_sdk: true } });

    expect(await screen.findByText("Embed")).toBeInTheDocument();
  });
});
