import { screen, renderWithProviders } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";

async function setup({
  collection,
}: { collection?: Partial<Collection> } = {}) {
  const mockCollection = createMockCollection(collection);

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
