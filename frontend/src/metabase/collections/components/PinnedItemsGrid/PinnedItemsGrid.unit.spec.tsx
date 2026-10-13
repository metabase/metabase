import userEvent from "@testing-library/user-event";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import type { OnToggleSelectedWithItem } from "metabase/common/collections/types";
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
  id: 1,
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

const isSameItem = (a: CollectionItem, b: CollectionItem) =>
  a.id === b.id && a.model === b.model;

function setup({
  items = defaultItems,
  collection = defaultCollection,
  selected = [],
  onToggleSelected = jest.fn(),
}: {
  items?: CollectionItem[];
  collection?: Collection;
  selected?: CollectionItem[];
  onToggleSelected?: OnToggleSelectedWithItem;
} = {}) {
  mockOnCopy.mockReset();
  mockOnMove.mockReset();

  setupCollectionItemsEndpoint({ collection, collectionItems: items });

  return renderWithProviders(
    <PinnedItemsGrid
      collectionId={collection.id}
      collection={collection}
      onCopy={mockOnCopy}
      onMove={mockOnMove}
      createBookmark={jest.fn()}
      deleteBookmark={jest.fn()}
      selected={selected}
      getIsSelected={(item) =>
        selected.some((selectedItem) => isSameItem(selectedItem, item))
      }
      onToggleSelected={onToggleSelected}
    />,
    {
      withDND: true,
    },
  );
}

describe("PinnedItemsGrid", () => {
  it("should render pinned items of all types in one section", async () => {
    setup();
    const section = within(await screen.findByTestId("pinned-items"));
    expect(section.getByText(dashboardItem.name)).toBeInTheDocument();
    expect(section.getByText(metricItem.name)).toBeInTheDocument();
    expect(section.getByText(questionItem.name)).toBeInTheDocument();
    expect(section.getByText(modelItem.name)).toBeInTheDocument();
  });

  it("should not group items into typed sections", async () => {
    setup();
    await screen.findByTestId("pinned-items");
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
    expect(screen.queryByText("Pinned questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Start new explorations/),
    ).not.toBeInTheDocument();
  });

  it("should render items sorted by collection_position across types", async () => {
    setup();
    const names = await screen.findAllByText(
      /Dashboard Foo|Metric Bar|Question Baz|Model Qux/,
    );
    expect(names.map((name) => name.textContent)).toEqual([
      "Metric Bar",
      "Dashboard Foo",
      "Question Baz",
      "Model Qux",
    ]);
  });

  it("should make all cards selectable when an item is selected", async () => {
    const onToggleSelected = jest.fn();

    setup({
      selected: [dashboardItem],
      onToggleSelected,
    });

    const section = within(await screen.findByTestId("pinned-items"));
    expect(section.getAllByRole("checkbox")).toHaveLength(defaultItems.length);
    expect(
      section.getByRole("checkbox", { name: dashboardItem.name }),
    ).toBeChecked();
    expect(
      section.getByRole("checkbox", { name: metricItem.name }),
    ).not.toBeChecked();

    await userEvent.click(
      section.getByRole("checkbox", { name: metricItem.name }),
    );

    expect(onToggleSelected).toHaveBeenCalledWith(metricItem);
  });

  it("should keep cards as links in a read-only collection", async () => {
    setup({
      collection: createMockCollection({
        ...defaultCollection,
        can_write: false,
      }),
      selected: [dashboardItem],
      onToggleSelected: jest.fn(),
    });

    await screen.findByTestId("pinned-items");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(defaultItems.length);
  });

  it("should keep cards as links when selection props are omitted", async () => {
    setup();

    await screen.findByTestId("pinned-items");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(defaultItems.length);
  });

  it("should keep cards as links when the selection is empty", async () => {
    setup({ selected: [], onToggleSelected: jest.fn() });

    await screen.findByTestId("pinned-items");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(defaultItems.length);
  });

  it("should preview selection while Shift is held", async () => {
    setup({ selected: [], onToggleSelected: jest.fn() });
    await screen.findByTestId("pinned-items");
    const card = screen.getByRole("link", { name: /Metric Bar/ });

    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    await userEvent.hover(card);

    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("pinned-item-checkbox")).not.toBeChecked();

    fireEvent.keyUp(window, { key: "Shift", shiftKey: false });
    expect(
      screen.queryByTestId("pinned-item-checkbox"),
    ).not.toBeInTheDocument();
  });
});
