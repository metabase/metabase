import { createVirtualAnchor } from "./PopoverWithRef";

function createAnchorEl(rect: Partial<DOMRect> = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  const fullRect = {
    top: 100,
    left: 200,
    bottom: 140,
    right: 360,
    width: 160,
    height: 40,
    x: 200,
    y: 100,
    toJSON: () => ({}),
    ...rect,
  };

  // jsdom elements return all zeros from getBoundingClientRect by default
  element.getBoundingClientRect = () => fullRect as DOMRect;
  return element;
}

describe("createVirtualAnchor", () => {
  it("returns the live rect while the element is connected", () => {
    const element = createAnchorEl({ top: 100, left: 200 });
    const anchor = createVirtualAnchor(element);

    expect(anchor.getBoundingClientRect().top).toBe(100);
    expect(anchor.getBoundingClientRect().left).toBe(200);

    // Simulate the element moving during normal scroll
    element.getBoundingClientRect = () =>
      ({
        top: 60,
        left: 200,
        bottom: 100,
        right: 360,
        width: 160,
        height: 40,
        x: 200,
        y: 60,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(anchor.getBoundingClientRect().top).toBe(60);
    expect(anchor.getBoundingClientRect().left).toBe(200);
  });

  it("returns the last known rect after the element is removed from DOM", () => {
    const element = createAnchorEl({ top: 100, left: 200 });
    const anchor = createVirtualAnchor(element);

    // Read once so lastRect is up to date
    anchor.getBoundingClientRect();

    element.remove();

    // Returns the cached rect to prevent the (0,0) flash
    const rect = anchor.getBoundingClientRect();
    expect(rect.top).toBe(100);
    expect(rect.left).toBe(200);
  });

  it("delegates contains() to the real element", () => {
    const element = createAnchorEl();
    const child = document.createElement("span");
    element.appendChild(child);
    const outside = document.createElement("span");

    const anchor = createVirtualAnchor(element);

    expect(anchor.contains(child)).toBe(true);
    expect(anchor.contains(outside)).toBe(false);
  });

  it("contains() still works after element is removed from DOM", () => {
    const element = createAnchorEl();
    const child = document.createElement("span");
    element.appendChild(child);

    const anchor = createVirtualAnchor(element);
    element.remove();

    // Detached elements still maintain parent-child relationships
    expect(anchor.contains(child)).toBe(true);
  });
});
