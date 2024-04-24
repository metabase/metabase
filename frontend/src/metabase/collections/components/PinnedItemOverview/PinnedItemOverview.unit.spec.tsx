import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, CollectionItem } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import PinnedItemOverview from "./PinnedItemOverview";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = createMockCollection({
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
});

const dashboardItem1: CollectionItem = {
  id: 1,
  model: "dashboard",
  collection_position: 2,
  collection_id: null,
  name: "Dashboard Foo",
  description: "description foo",
  getIcon: () => ({ name: "dashboard" }),
  getUrl: () => "/dashboard/1",
  setArchived: jest.fn(),
  setPinned: jest.fn(),
};

const dashboardItem2: CollectionItem = {
  id: 2,
  model: "dashboard",
  collection_position: 1,
  collection_id: null,
  name: "Dashboard Bar",
  description: "description foo",
  getIcon: () => ({ name: "dashboard" }),
  getUrl: () => "/dashboard/2",
  setArchived: jest.fn(),
  setPinned: jest.fn(),
};

function setup({
  items,
  collection,
}: { items?: CollectionItem[]; collection?: Collection } = {}) {
  items = items || [dashboardItem1, dashboardItem2];
  collection = collection || defaultCollection;

  mockOnCopy.mockReset();
  mockOnMove.mockReset();

  return renderWithProviders(
    <PinnedItemOverview
      items={items}
      collection={collection}
      onCopy={mockOnCopy}
      onMove={mockOnMove}
      createBookmark={jest.fn()}
      deleteBookmark={jest.fn()}
    />,
    {
      withDND: true,
    },
  );
}

describe("PinnedItemOverview", () => {
  it("should render items", () => {
    setup();
    expect(screen.getByText(dashboardItem1.name)).toBeInTheDocument();
    expect(screen.getByText(dashboardItem2.name)).toBeInTheDocument();
  });

  it("should render items sorted by collection_position", () => {
    setup();
    const names = screen.queryAllByText(/Dashboard (Foo|Bar)/);
    expect(names[0]).toHaveTextContent(new RegExp(dashboardItem2.name));
    expect(names[1]).toHaveTextContent(new RegExp(dashboardItem1.name));
  });
});
