import { fireEvent, render, screen } from "__support__/ui";

import { ResizableSummaryPanel } from "./ResizableSummaryPanel";
import S from "./ResizableSummaryPanel.module.css";

type SetupOpts = {
  containerWidth: number;
};

function setup({ containerWidth }: SetupOpts) {
  const view = render(
    <ResizableSummaryPanel containerWidth={containerWidth}>
      <div>{"Panel content"}</div>
    </ResizableSummaryPanel>,
  );
  const rerender = ({ containerWidth }: SetupOpts) =>
    view.rerender(
      <ResizableSummaryPanel containerWidth={containerWidth}>
        <div>{"Panel content"}</div>
      </ResizableSummaryPanel>,
    );
  return { rerender, unmount: view.unmount };
}

function isPageResizing() {
  return document.body.classList.contains(S.isResizing);
}

function getPanel() {
  return screen.getByTestId("summary-panel").parentElement;
}

function getPanelWidth() {
  return getPanel()?.style.width;
}

// the handle is rendered after the content, as the panel's last child
function getHandle() {
  const handle = getPanel()?.lastElementChild;
  if (handle == null) {
    throw new Error("The panel has no resize handle");
  }
  return handle;
}

/** Drags the left edge by `distance` pixels, to the left for a negative one. Releases unless `release` is false. */
function dragEdge(distance: number, { release = true } = {}) {
  fireEvent.mouseDown(getHandle(), { clientX: 500, clientY: 100 });
  fireEvent.mouseMove(document, { clientX: 500 + distance, clientY: 100 });
  if (release) {
    fireEvent.mouseUp(document, { clientX: 500 + distance, clientY: 100 });
  }
}

describe("ResizableSummaryPanel", () => {
  it("shows its content at 650px to start", () => {
    setup({ containerWidth: 1200 });

    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(getPanelWidth()).toBe("650px");
  });

  it("keeps the default width while the container has not been measured", () => {
    setup({ containerWidth: 0 });

    expect(getPanelWidth()).toBe("650px");
  });

  it("widens when its left edge is dragged left, leaving the results at least 320px", () => {
    setup({ containerWidth: 1200 });

    dragEdge(-150);
    expect(getPanelWidth()).toBe("800px");

    dragEdge(-500);
    expect(getPanelWidth()).toBe("880px");
  });

  it("narrows when its left edge is dragged right, never below 320px", () => {
    setup({ containerWidth: 1200 });

    dragEdge(200);
    expect(getPanelWidth()).toBe("450px");

    dragEdge(500);
    expect(getPanelWidth()).toBe("320px");
  });

  it("keeps the dragged width, clamped to what the results leave it, as the container changes", () => {
    const { rerender } = setup({ containerWidth: 1200 });
    dragEdge(-150);

    rerender({ containerWidth: 1000 });
    expect(getPanelWidth()).toBe("680px");

    rerender({ containerWidth: 1200 });
    expect(getPanelWidth()).toBe("800px");
  });

  it("marks its content and the page while dragging, and clears both when the drag ends or it unmounts", () => {
    const { unmount } = setup({ containerWidth: 1200 });
    const content = screen.getByTestId("summary-panel");
    expect(content).not.toHaveAttribute("data-resizing");
    expect(isPageResizing()).toBe(false);

    dragEdge(-50, { release: false });
    expect(content).toHaveAttribute("data-resizing");
    expect(isPageResizing()).toBe(true);

    fireEvent.mouseUp(document);
    expect(content).not.toHaveAttribute("data-resizing");
    expect(isPageResizing()).toBe(false);

    dragEdge(-50, { release: false });
    expect(isPageResizing()).toBe(true);
    unmount();
    expect(isPageResizing()).toBe(false);
  });
});
