import { act, screen } from "__support__/ui";

import { setup } from "./setup";

// Capture resize-observer subscriptions so we can synthetically drive the
// ResizeObserver callback that grows the modal (jsdom performs no layout, so
// the real observer never fires).
type ResizeCb = (entry: ResizeObserverEntry) => void;
const mockSubscriptions: Array<{ target: Element; callback: ResizeCb }> = [];

jest.mock("metabase/utils/resize-observer", () => ({
  __esModule: true,
  default: {
    subscribe: (target: Element, callback: ResizeCb) => {
      mockSubscriptions.push({ target, callback });
    },
    unsubscribe: () => {},
  },
}));

const getModalContent = () =>
  document.querySelector<HTMLElement>("[class*='Modal-content']") as HTMLElement;

const fireContentResize = (width: number) => {
  const target = getModalContent();
  const entry = {
    target,
    contentRect: { width } as DOMRectReadOnly,
  } as ResizeObserverEntry;
  act(() => {
    mockSubscriptions
      .filter((sub) => sub.target === target)
      .forEach((sub) => sub.callback(entry));
  });
};

describe("EntityPickerModal width (metabase#55690)", () => {
  afterEach(() => {
    mockSubscriptions.length = 0;
    jest.restoreAllMocks();
  });

  it("should grow its min-width to fit content, but never shrink back", async () => {
    await setup({ title: "Pick a thing" });
    await screen.findByText("Pick a thing");

    const content = getModalContent();

    // Starts at the default floor of 920px.
    expect(content.style.minWidth).toBe("min(920px, 80vw)");

    // Grows when the observed content width exceeds the current floor.
    fireContentResize(1097);
    expect(content.style.minWidth).toBe("min(1097px, 80vw)");

    // Does NOT shrink when the observed width later gets smaller.
    fireContentResize(800);
    expect(content.style.minWidth).toBe("min(1097px, 80vw)");
  });
});
