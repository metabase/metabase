import { renderWithProviders } from "__support__/ui";

import { PopoverWithRef } from "./PopoverWithRef";

describe("PopoverWithRef", () => {
  it("should return cached rect when anchor element is removed from DOM", () => {
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);

    // Mock getBoundingClientRect to return a known position
    anchor.getBoundingClientRect = jest.fn(() => ({
      top: 100,
      left: 200,
      bottom: 120,
      right: 300,
      width: 100,
      height: 20,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    }));

    renderWithProviders(
      <PopoverWithRef anchorEl={anchor} opened>
        <div data-testid="content">Popover content</div>
      </PopoverWithRef>,
    );

    // After passing through PopoverWithRef, getBoundingClientRect should
    // still work normally while connected
    const rectWhileConnected = anchor.getBoundingClientRect();
    expect(rectWhileConnected.top).toBe(100);
    expect(rectWhileConnected.left).toBe(200);

    // Remove the element from DOM (simulates virtual scroll unmounting a row)
    document.body.removeChild(anchor);

    // getBoundingClientRect should return cached values, not zeros
    const rectWhileDetached = anchor.getBoundingClientRect();
    expect(rectWhileDetached.top).toBe(100);
    expect(rectWhileDetached.left).toBe(200);
    expect(rectWhileDetached.width).toBe(100);
    expect(rectWhileDetached.height).toBe(20);
  });
});
