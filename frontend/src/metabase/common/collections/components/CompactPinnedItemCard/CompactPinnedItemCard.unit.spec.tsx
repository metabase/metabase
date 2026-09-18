import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  act,
  fireEvent,
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

function HoverStateHarness() {
  const [isSelectMode, setIsSelectMode] = useState(true);
  const [isSelected, setIsSelected] = useState(false);

  const handleToggleSelected = () => {
    if (isSelected) {
      setIsSelected(false);
      setIsSelectMode(false);
    } else {
      setIsSelected(true);
    }
  };

  return (
    <>
      <button onClick={() => setIsSelectMode(true)}>Enter select mode</button>
      <CompactPinnedItemCard
        item={defaultItem}
        collection={defaultCollection}
        isSelectMode={isSelectMode}
        isSelected={isSelected}
        onToggleSelected={handleToggleSelected}
      />
    </>
  );
}

function setup({
  item = defaultItem,
  collection = defaultCollection,
  isSelectMode,
  isSelected,
  onToggleSelected,
  onClick,
  showSelectAffordance,
}: {
  item?: CollectionItem | RecentCollectionItem;
  collection?: Collection;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
  onClick?: () => void;
  showSelectAffordance?: boolean;
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
          onClick={onClick}
          showSelectAffordance={showSelectAffordance}
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

    it("should swap the icon for an unchecked checkbox while hovering an unselected card", async () => {
      setup({
        isSelectMode: true,
        isSelected: false,
        onToggleSelected: jest.fn(),
      });
      const card = screen.getByRole("checkbox", { name: defaultItem.name });

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();

      await userEvent.hover(card);

      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("pinned-item-checkbox")).not.toBeChecked();
      expect(card).not.toBeChecked();

      await userEvent.unhover(card);

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
    });

    it("should show a checked checkbox while hovering a selected card", async () => {
      setup({
        isSelectMode: true,
        isSelected: true,
        onToggleSelected: jest.fn(),
      });
      const card = screen.getByRole("checkbox", { name: defaultItem.name });

      expect(screen.getByTestId("pinned-item-checkbox")).toBeChecked();
      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();

      await userEvent.hover(card);

      expect(screen.getByTestId("pinned-item-checkbox")).toBeChecked();
      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();

      await userEvent.unhover(card);

      expect(screen.getByTestId("pinned-item-checkbox")).toBeChecked();
    });

    it("should swap the icon for a checkbox when the card receives keyboard focus", () => {
      setup({
        isSelectMode: true,
        isSelected: false,
        onToggleSelected: jest.fn(),
      });
      const card = screen.getByRole("checkbox", { name: defaultItem.name });

      act(() => card.focus());

      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("pinned-item-checkbox")).toBeInTheDocument();

      fireEvent.blur(card);

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
    });

    it("should keep the model icon when focusing the action menu", () => {
      setup({
        isSelectMode: true,
        isSelected: false,
        onToggleSelected: jest.fn(),
      });

      fireEvent.focus(screen.getByRole("button", { name: "Actions" }));

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
    });

    it("should not swap the icon on hover outside select mode", async () => {
      setup();
      const card = screen.getByTestId("pinned-item-card");

      await userEvent.hover(card);

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
      expect(
        screen.queryByTestId("pinned-item-checkbox"),
      ).not.toBeInTheDocument();
    });

    it("should clear hover state after leaving a card outside select mode (UXW-4996)", async () => {
      renderWithProviders(<Route path="/" element={<HoverStateHarness />} />, {
        withRouter: true,
      });
      const card = screen.getByRole("checkbox", { name: defaultItem.name });

      fireEvent.mouseEnter(card);
      expect(screen.getByTestId("pinned-item-checkbox")).toBeInTheDocument();

      fireEvent.click(card);
      fireEvent.click(card);
      fireEvent.mouseLeave(screen.getByRole("link"));
      await userEvent.click(
        screen.getByRole("button", { name: "Enter select mode" }),
      );

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
      expect(
        screen.queryByTestId("pinned-item-checkbox"),
      ).not.toBeInTheDocument();
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

      act(() => card.focus());
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

  describe("shift selection", () => {
    it("should select a link-mode card without navigating on shift+click", async () => {
      const utils = userEvent.setup();
      const onClick = jest.fn();
      const onToggleSelected = jest.fn();
      setup({ onClick, onToggleSelected });

      await utils.keyboard("{Shift>}");
      await utils.click(screen.getByText(defaultItem.name));
      await utils.keyboard("{/Shift}");

      expect(onToggleSelected).toHaveBeenCalledWith(defaultItem);
      expect(onClick).not.toHaveBeenCalled();
      expect(screen.getByRole("link")).toBeInTheDocument();
    });

    it("should preserve plain link clicks", async () => {
      const onClick = jest.fn();
      const onToggleSelected = jest.fn();
      setup({ onClick, onToggleSelected });
      screen
        .getByRole("link")
        .addEventListener("click", (event) => event.preventDefault());

      await userEvent.click(screen.getByText(defaultItem.name));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it("should not select on shift+click when selection is unavailable", async () => {
      const utils = userEvent.setup();
      const onClick = jest.fn();
      setup({ onClick });
      screen
        .getByRole("link")
        .addEventListener("click", (event) => event.preventDefault());

      await utils.keyboard("{Shift>}");
      await utils.click(screen.getByText(defaultItem.name));
      await utils.keyboard("{/Shift}");

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("should preview an unchecked checkbox on a hovered link", async () => {
      setup({
        onToggleSelected: jest.fn(),
        showSelectAffordance: true,
      });
      const card = screen.getByRole("link");

      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
      await userEvent.hover(card);

      expect(card).toBeInTheDocument();
      expect(screen.getByTestId("pinned-item-checkbox")).not.toBeChecked();
      expect(
        queryIcon(modelIconMap[defaultItem.model]),
      ).not.toBeInTheDocument();
    });

    it("should keep the model icon until the link is hovered", () => {
      setup({
        onToggleSelected: jest.fn(),
        showSelectAffordance: true,
      });

      expect(screen.getByRole("link")).toBeInTheDocument();
      expect(testGetIcon(modelIconMap[defaultItem.model])).toBeInTheDocument();
      expect(
        screen.queryByTestId("pinned-item-checkbox"),
      ).not.toBeInTheDocument();
    });

    it("should select an item from the overflow menu", async () => {
      const onToggleSelected = jest.fn();
      setup({ onToggleSelected });

      await userEvent.click(screen.getByRole("button", { name: "Actions" }));
      await userEvent.click(await screen.findByText("Select"));

      expect(onToggleSelected).toHaveBeenCalledWith(defaultItem);
    });

    it("should show Deselect for a selected item", async () => {
      setup({
        isSelectMode: true,
        isSelected: true,
        onToggleSelected: jest.fn(),
      });

      await userEvent.click(screen.getByRole("button", { name: "Actions" }));

      expect(await screen.findByText("Deselect")).toBeInTheDocument();
    });

    it("should omit selection from the menu without a toggle callback", async () => {
      setup();

      await userEvent.click(screen.getByRole("button", { name: "Actions" }));

      expect(screen.queryByText("Select")).not.toBeInTheDocument();
      expect(screen.queryByText("Deselect")).not.toBeInTheDocument();
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
