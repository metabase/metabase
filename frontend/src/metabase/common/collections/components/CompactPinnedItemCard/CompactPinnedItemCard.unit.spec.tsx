import userEvent from "@testing-library/user-event";

import {
  renderWithProviders,
  screen,
  getIcon as testGetIcon,
} from "__support__/ui";
import { modelIconMap } from "metabase/common/utils/icon";
import { Route } from "metabase/router";
import type { CollectionItemModel } from "metabase-types/api";
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

function setup({ item = defaultItem, collection = defaultCollection } = {}) {
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
