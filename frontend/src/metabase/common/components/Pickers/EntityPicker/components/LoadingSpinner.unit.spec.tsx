import { act, render, screen } from "__support__/ui";

import { ItemListLoader } from "./LoadingSpinner";

describe("ItemListLoader (metabase#UXW-4025)", () => {
  it("shows loading skeletons after a short delay instead of a spinner", () => {
    jest.useFakeTimers();

    try {
      render(<ItemListLoader />);

      // The loading indicator is present the whole time
      expect(screen.getByTestId("loading-indicator")).toBeEmptyDOMElement();

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Once the delay elapses, skeleton rows fill the indicator.
      expect(screen.getByTestId("loading-indicator")).not.toBeEmptyDOMElement();
    } finally {
      jest.useRealTimers();
    }
  });
});
