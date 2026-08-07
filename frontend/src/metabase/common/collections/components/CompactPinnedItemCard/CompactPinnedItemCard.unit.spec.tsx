import userEvent from "@testing-library/user-event";

import {
  queryIcon,
  renderWithProviders,
  screen,
  getIcon as testGetIcon,
} from "__support__/ui";
import type { OnToggleSelectedWithItem } from "metabase/common/collections/types";
import { modelIconMap } from "metabase/common/utils/icon";
import { Route } from "metabase/router";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  RecentCollectionItem,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import { createMockRecentCollectionItem } from "metabase-types/api/mocks/activity";

import { CompactPinnedItemCard } from "./CompactPinnedItemCard";
import { CompactPinnedItemCardSkeleton } from "./CompactPinnedItemCardSkeleton";

const defaultCollection = createMockCollection({
  can_write: true,
  id: 1,
  name: "Collection Foo",
});

const defaultItem = createMockCollectionItem({
  id: 1,
  model: "dashboard",
  name: "My Item",
  description: "description foo foo foo",
  collection_position: 1,
});

function setup({
  item = defaultItem,
  collection = defaultCollection,
  isSelectMode,
  isSelected,
  onToggleSelected,
}: {
  item?: CollectionItem | RecentCollectionItem;
  collection?: Collection;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
} = {}) {
  return renderWithProviders(
    <Route
      path="/"
      element={
        <CompactPinnedItemCard
          item={item}
          collection={collection}
          onCopy={jest.fn()}
          onMove={jest.fn()}
          createBookmark={jest.fn()}
          deleteBookmark={jest.fn()}
          isSelectMode={isSelectMode}
          isSelected={isSelected}
          onToggleSelected={onToggleSelected}
        />
      }
    />,
    { withRouter: true },
  );
}

describe("CompactPinnedItemCard", () => {
  it("should show the item's icon", () => {
    setup();
    expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
  });

  it("should show the item's name and description", () => {
    setup();
    expect(screen.getByText("My Item")).toBeInTheDocument();
    expect(screen.getByText("description foo foo foo")).toBeInTheDocument();
  });

  it("should link to the item's url", () => {
    setup();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining("/dashboard/1"),
    );
  });

  it.each<[CollectionItemModel, string]>([
    ["card", "A question"],
    ["metric", "A metric"],
    ["dashboard", "A dashboard"],
    ["dataset", "A model"],
    ["document", "A document"],
  ])(
    "should show a default description for a %s without a description",
    (model, description) => {
      setup({
        item: createMockCollectionItem({ model, description: "" }),
      });
      expect(screen.getByText(description)).toBeInTheDocument();
    },
  );

  it("should show an action menu when user clicks on the menu icon in the card", async () => {
    setup();
    await userEvent.click(testGetIcon("ellipsis"));
    expect(await screen.findByText("Unpin")).toBeInTheDocument();
  });

  describe("select mode", () => {
    it("should render a selected card as a checkbox without a model icon or link", () => {
      setup({
        isSelectMode: true,
        isSelected: true,
        onToggleSelected: jest.fn(),
      });

      expect(
        screen.getByRole("checkbox", { name: defaultItem.name }),
      ).toBeChecked();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("pinned-item-card")).toBeInTheDocument();
    });

    it("should keep the model icon on an unselected card", () => {
      setup({
        isSelectMode: true,
        isSelected: false,
        onToggleSelected: jest.fn(),
      });

      expect(
        screen.getByRole("checkbox", { name: defaultItem.name }),
      ).not.toBeChecked();
      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
    });

    it("should toggle the item exactly once when the card body is clicked", async () => {
      const onToggleSelected = jest.fn();
      setup({ isSelectMode: true, onToggleSelected });

      await userEvent.click(screen.getByText(defaultItem.name));

      expect(onToggleSelected).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).toHaveBeenCalledWith(defaultItem);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("should toggle the item with the Space key", async () => {
      const onToggleSelected = jest.fn();
      setup({ isSelectMode: true, onToggleSelected });
      const card = screen.getByRole("checkbox", { name: defaultItem.name });

      card.focus();
      await userEvent.keyboard(" ");

      expect(onToggleSelected).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).toHaveBeenCalledWith(defaultItem);
    });

    it("should open the action menu without toggling the item", async () => {
      const onToggleSelected = jest.fn();
      setup({ isSelectMode: true, onToggleSelected });

      await userEvent.click(testGetIcon("ellipsis"));

      expect(await screen.findByText("Unpin")).toBeInTheDocument();
      expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it("should open the action menu with the keyboard without toggling the item", async () => {
      const onToggleSelected = jest.fn();
      setup({ isSelectMode: true, onToggleSelected });

      screen.getByRole("button", { name: "Actions" }).focus();
      await userEvent.keyboard("{Enter}");

      expect(await screen.findByText("Unpin")).toBeInTheDocument();
      expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it("should render a link when selection props are omitted", () => {
      setup();

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("link")).toBeInTheDocument();
      expect(screen.getByTestId("pinned-item-card")).toBeInTheDocument();
    });

    it("should keep recent items as links", () => {
      const recentItem = createMockRecentCollectionItem({
        id: 7,
        model: "dataset",
        name: "Recent model",
      });

      setup({
        item: recentItem,
        isSelectMode: true,
        onToggleSelected: jest.fn(),
      });

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("link")).toBeInTheDocument();
    });
  });

  describe("recent items", () => {
    const recentModel = createMockRecentCollectionItem({
      id: 7,
      model: "dataset",
      name: "Recent model",
      description: "recently viewed",
    });

    it("should render a recent item with its name, description and link", () => {
      renderWithProviders(
        <Route
          path="/"
          element={<CompactPinnedItemCard item={recentModel} />}
        />,
        { withRouter: true },
      );

      expect(screen.getByText("Recent model")).toBeInTheDocument();
      expect(screen.getByText("recently viewed")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        expect.stringContaining("/model/7"),
      );
    });

    it("should not show an action menu for a recent item", () => {
      renderWithProviders(
        <Route
          path="/"
          element={
            <CompactPinnedItemCard
              item={recentModel}
              collection={defaultCollection}
              onCopy={jest.fn()}
              onMove={jest.fn()}
            />
          }
        />,
        { withRouter: true },
      );

      expect(screen.queryByLabelText("Actions")).not.toBeInTheDocument();
    });

    it("should call onClick when the card is clicked", async () => {
      const onClick = jest.fn();
      renderWithProviders(
        <Route
          path="/"
          element={
            <CompactPinnedItemCard item={recentModel} onClick={onClick} />
          }
        />,
        { withRouter: true },
      );

      await userEvent.click(screen.getByText("Recent model"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("skeleton", () => {
    it("should render a skeleton card without a link", () => {
      renderWithProviders(<CompactPinnedItemCardSkeleton icon="model" />);

      expect(testGetIcon("model")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
