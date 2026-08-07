import { renderWithProviders, screen, within } from "__support__/ui";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { PinnedItemsGrid } from "./PinnedItemsGrid";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = createMockCollection({
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
});

const dashboardItem = createMockCollectionItem({
  id: 1,
  model: "dashboard",
  collection_position: 2,
  name: "Dashboard Foo",
  description: "description foo",
});

const metricItem = createMockCollectionItem({
  id: 2,
  model: "metric",
  collection_position: 1,
  name: "Metric Bar",
});

const questionItem = createMockCollectionItem({
  id: 3,
  model: "card",
  collection_position: 3,
  name: "Question Baz",
});

const modelItem = createMockCollectionItem({
  id: 4,
  model: "dataset",
  collection_position: 4,
  name: "Model Qux",
});

const defaultItems = [dashboardItem, metricItem, questionItem, modelItem];

function setup({
  items,
  collection,
}: { items?: CollectionItem[]; collection?: Collection } = {}) {
  items = items || defaultItems;
  collection = collection || defaultCollection;

  mockOnCopy.mockReset();
  mockOnMove.mockReset();

  return renderWithProviders(
    <PinnedItemsGrid
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

describe("PinnedItemsGrid", () => {
  it("should render pinned items of all types in one section", () => {
    setup();
    const section = within(screen.getByTestId("pinned-items"));
    expect(section.getByText(dashboardItem.name)).toBeInTheDocument();
    expect(section.getByText(metricItem.name)).toBeInTheDocument();
    expect(section.getByText(questionItem.name)).toBeInTheDocument();
    expect(section.getByText(modelItem.name)).toBeInTheDocument();
  });

  it("should not group items into typed sections", () => {
    setup();
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    expect(screen.queryByText("Pinned questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Start new explorations/),
    ).not.toBeInTheDocument();
  });

  it("should render items sorted by collection_position across types", () => {
    setup();
    const names = screen.getAllByText(
      /Dashboard Foo|Metric Bar|Question Baz|Model Qux/,
    );
    expect(names.map((name) => name.textContent)).toEqual([
      "Metric Bar",
      "Dashboard Foo",
      "Question Baz",
      "Model Qux",
    ]);
  });
});
