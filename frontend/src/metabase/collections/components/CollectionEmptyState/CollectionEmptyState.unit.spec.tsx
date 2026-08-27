import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

console.warn = jest.fn();
console.error = jest.fn();

const TEST_DATABASE = createMockDatabase();

const TEST_COLLECTION = createMockCollection();
const TEST_COLLECTION_ITEM = createMockCollectionItem({
  collection: TEST_COLLECTION,
  model: "dataset",
});

async function setup({
  collection,
  isAdmin = false,
  isAnalyst = false,
  hasEnterprisePlugins = false,
}: {
  collection?: Partial<Collection>;
  isAdmin?: boolean;
  isAnalyst?: boolean;
  hasEnterprisePlugins?: boolean;
} = {}) {
  const mockCollection = createMockCollection(collection);

  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints([TEST_COLLECTION_ITEM]);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
    currentUser: createMockUser({
      is_superuser: isAdmin,
      is_data_analyst: isAnalyst,
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<CollectionEmptyState collection={mockCollection} />, {
    storeInitialState: state,
  });
}

describe("empty collection", () => {
  it("should show the 'new' menu button if the user has write access", async () => {
    await setup();

    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("should not show the 'new' menu button if the user lacks write access", async () => {
    await setup({ collection: { can_write: false } });

    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });
});

describe("library sub-collection empty state", () => {
  const PUBLISH_CTA = "Publish tables in the Library to see them here.";
  const LIBRARY_DATA_COLLECTION = { type: "library-data" as const };

  it("shows the publish CTA to admins", async () => {
    await setup({
      collection: LIBRARY_DATA_COLLECTION,
      isAdmin: true,
      hasEnterprisePlugins: true,
    });

    expect(screen.getByText("No published tables yet")).toBeInTheDocument();
    expect(screen.getByText(PUBLISH_CTA)).toBeInTheDocument();
  });

  it("shows the publish CTA to data analysts", async () => {
    await setup({
      collection: LIBRARY_DATA_COLLECTION,
      isAnalyst: true,
      hasEnterprisePlugins: true,
    });

    expect(screen.getByText(PUBLISH_CTA)).toBeInTheDocument();
  });

  it("hides the publish CTA from users who cannot publish, but keeps the title (metabase#UXW-4243)", async () => {
    await setup({
      collection: LIBRARY_DATA_COLLECTION,
      hasEnterprisePlugins: true,
    });

    expect(screen.getByText("No published tables yet")).toBeInTheDocument();
    expect(screen.queryByText(PUBLISH_CTA)).not.toBeInTheDocument();
  });

  it("keeps the metrics description visible to users who cannot publish", async () => {
    await setup({
      collection: { type: "library-metrics" as const },
      hasEnterprisePlugins: true,
    });

    expect(
      screen.getByText("Put metrics in the Library to see them here."),
    ).toBeInTheDocument();
  });
});
