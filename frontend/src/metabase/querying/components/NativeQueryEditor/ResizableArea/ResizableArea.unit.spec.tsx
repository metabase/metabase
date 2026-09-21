import { render, screen } from "@testing-library/react";

import { ThemeProvider } from "metabase/ui";

import { ResizableArea } from "./ResizableArea";

const renderWithProvider = (component: React.ReactElement) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe("ResizableArea", () => {
  it("should prevent default mousedown behavior on drag handle", () => {
    renderWithProvider(
      <ResizableArea resizable initialHeight={200} maxHeight={500}>
        <div>Query editor</div>
      </ResizableArea>,
    );

    const dragHandle = screen.getByTestId("drag-handle");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    dragHandle.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
