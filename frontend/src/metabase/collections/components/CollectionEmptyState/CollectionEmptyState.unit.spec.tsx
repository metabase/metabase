import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { screen, renderWithProviders } from "__support__/ui";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
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
}: { collection?: Partial<Collection> } = {}) {
  const mockCollection = createMockCollection(collection);

  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints([TEST_COLLECTION_ITEM]);

  renderWithProviders(<CollectionEmptyState collection={mockCollection} />);
}

describe("empty collection", () => {
  it("should show the 'create a new' button if the user has write access", async () => {
    await setup();

    expect(screen.getByText("Create a new…")).toBeInTheDocument();
  });

  it("should not show the 'create a new' button if the user lacks write access", async () => {
    await setup({ collection: { can_write: false } });

    expect(screen.queryByText("Create a new…")).not.toBeInTheDocument();
  });
});
