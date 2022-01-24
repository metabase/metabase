import React from "react";
import { render } from "@testing-library/react";

import PinnedItemOverview from "./PinnedItemOverview";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = {
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
};

const defaultItem = {
  id: 1,
  model: "dashboard",
  collection_position: 1,
  name: "Dashboard Foo",
  description: "description foo foo foo",
  getIcon: () => ({ name: "dashboard" }),
  getUrl: () => "/dashboard/1",
  setArchived: jest.fn(),
  setPinned: jest.fn(),
};

function setup({ items, collection } = {}) {
  items = items || [defaultItem];
  collection = collection || defaultCollection;

  mockOnCopy.mockReset();
  mockOnMove.mockReset();

  return render(
    <PinnedItemOverview
      items={items}
      collection={collection}
      metadata={{}}
      onCopy={mockOnCopy}
      onMove={mockOnMove}
      onDrop={jest.fn()}
    />,
  );
}

describe("PinnedItemOverview", () => {
  it("should render nothing if there are no items", () => {
    const { container } = setup({ items: [] });
    expect(container.firstChild).toBeNull();
  });
});
