import { act, render, screen } from "__support__/ui";

import { ItemListLoader } from "./ItemListLoader";

describe("ItemListLoader (metabase#UXW-4025)", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });
  it("shows loading skeletons after a short delay instead of a spinner", () => {
    render(<ItemListLoader />);

    // The loading indicator is present the whole time
    expect(screen.getByTestId("loading-indicator")).toBeEmptyDOMElement();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Once the delay elapses, skeleton rows fill the indicator.
    expect(screen.getByTestId("loading-indicator")).not.toBeEmptyDOMElement();
  });
});
