import { renderWithProviders, screen } from "__support__/ui";

import { ItemsDragLayerInner, MoveItemsDragPreview } from "./ItemsDragLayer";

describe("ItemsDragLayerInner", () => {
  it("should ignore native drag payloads (UXW-233)", () => {
    renderWithProviders(
      <ItemsDragLayerInner
        currentOffset={{ x: 0, y: 0 }}
        isDragging
        payload={{ urls: ["https://example.com"] }}
      />,
    );

    expect(screen.queryByTestId("items-drag-preview")).not.toBeInTheDocument();
  });
});

describe("MoveItemsDragPreview", () => {
  it("should describe a single dragged item", () => {
    renderWithProviders(<MoveItemsDragPreview count={1} />);

    expect(screen.getByTestId("items-drag-preview")).toHaveTextContent(
      "Move 1 item",
    );
  });

  it("should describe multiple dragged items", () => {
    renderWithProviders(<MoveItemsDragPreview count={2} />);

    expect(screen.getByTestId("items-drag-preview")).toHaveTextContent(
      "Move 2 items",
    );
  });
});
