import { act, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { setup } from "./setup";

type ResizeCallback = (entry: { contentRect: { width: number } }) => void;
const mockSubscriptions: Array<{ target: Element; callback: ResizeCallback }> =
  [];

// jsdom does no layout, so the test calls the resize observer callbacks itself.
jest.mock("metabase/utils/resize-observer", () => ({
  __esModule: true,
  default: {
    subscribe: (target: Element, callback: ResizeCallback) => {
      mockSubscriptions.push({ target, callback });
    },
    unsubscribe: () => {},
  },
}));

const getModalContent = () =>
  checkNotNull(document.querySelector<HTMLElement>("[class*='Modal-content']"));

const fireContentResize = (width: number) => {
  const target = getModalContent();
  act(() => {
    mockSubscriptions
      .filter((sub) => sub.target === target)
      .forEach((sub) => sub.callback({ contentRect: { width } }));
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
    expect(content).toHaveStyle({ minWidth: "min(920px, 80vw)" });

    fireContentResize(1097);
    expect(content).toHaveStyle({ minWidth: "min(1097px, 80vw)" });

    fireContentResize(800);
    expect(content).toHaveStyle({ minWidth: "min(1097px, 80vw)" });
  });
});
