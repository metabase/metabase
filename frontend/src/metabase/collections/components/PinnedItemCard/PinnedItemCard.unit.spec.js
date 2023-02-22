import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, getIcon } from "__support__/ui";

import PinnedItemCard from "./PinnedItemCard";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = {
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
};

function getCollectionItem({
  id = 1,
  model = "dashboard",
  name = "My Item",
  description = "description foo foo foo",
  collection_position = 1,
  icon = "dashboard",
  url = "/dashboard/1",
  setArchived = jest.fn(),
  setPinned = jest.fn(),
  ...rest
} = {}) {
  return {
    ...rest,
    id,
    model,
    name,
    description,
    collection_position,
    getIcon: () => ({ name: icon }),
    getUrl: () => url,
    setArchived,
    setPinned,
  };
}

const defaultItem = getCollectionItem();

function setup({ item = defaultItem, collection = defaultCollection } = {}) {
  mockOnCopy.mockReset();
  mockOnMove.mockReset();
  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <PinnedItemCard
          item={item}
          collection={collection}
          onCopy={mockOnCopy}
          onMove={mockOnMove}
        />
      )}
    />,
    { withRouter: true },
  );
}

describe("PinnedItemCard", () => {
  it("should show the item's icon", () => {
    setup();
    expect(getIcon(defaultItem.getIcon().name)).toBeInTheDocument();
  });

  it("should show the item's name", () => {
    setup();
    expect(screen.getByText(defaultItem.name)).toBeInTheDocument();
  });

  it("should show the item's description", () => {
    setup();
    expect(screen.getByText(defaultItem.description)).toBeInTheDocument();
  });

  it("should show a default description if there is no item description", () => {
    setup({ item: getCollectionItem({ description: null }) });
    expect(screen.getByText("A dashboard")).toBeInTheDocument();
  });

  it("should show an action menu when user clicks on the menu icon in the card", () => {
    setup();
    userEvent.click(getIcon("ellipsis"));
    expect(screen.getByText("Unpin")).toBeInTheDocument();
  });

  it("doesn't show model detail page link", () => {
    setup();
    expect(screen.queryByTestId("model-detail-link")).not.toBeInTheDocument();
  });

  describe("models", () => {
    const model = getCollectionItem({
      id: 1,
      name: "Order",
      model: "dataset",
      url: "/model/1",
    });

    it("should show a model detail page link", () => {
      setup({ item: model });
      expect(screen.getByTestId("model-detail-link")).toBeInTheDocument();
      expect(screen.getByTestId("model-detail-link")).toHaveAttribute(
        "href",
        "/model/1-order/detail",
      );
    });
  });
});
