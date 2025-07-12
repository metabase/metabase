import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import NewItemMenu from "./NewItemMenu";

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();

async function setup({ databases = [SAMPLE_DATABASE] }: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);
  setupEnterprisePlugins();

  renderWithProviders(<NewItemMenu trigger={<button>New</button>} />);

  await userEvent.click(screen.getByText("New"));
}

describe("NewItemMenu (EE without token)", () => {
  beforeEach(() => {
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not show the Embed item when the feature token is missing", async () => {
    setup();
    await expect(screen.queryByText("Embed")).not.toBeInTheDocument();
  });
});
