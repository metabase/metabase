import { isValidElement } from "react";
import type { ResizableProps, ResizeCallbackData } from "react-resizable";

import { act, render, screen } from "__support__/ui";

import { ResizableSidePanel } from "./ResizableSidePanel";
import {
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SIDE_PANEL_SIZES,
  type SidePanelSize,
} from "./constants";
import { getStoredSidePanelWidth, setStoredSidePanelWidth } from "./storage";

const STORAGE_KEY = "test-panel";

const makeResizeData = (width: number): ResizeCallbackData => ({
  size: { width, height: 0 },
  node: document.createElement("div"),
  handle: "e",
});

// react-resizable's callbacks require a SyntheticEvent, but ResizableSidePanel
// never reads it, so an empty stand-in is sufficient for these tests.
const FAKE_EVENT = {} as React.SyntheticEvent;

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

type SetupOpts = {
  side?: "left" | "right";
  defaultSize?: SidePanelSize;
  maxSize?: SidePanelSize;
  onResize?: (width: number) => void;
  onResizeStop?: (width: number) => void;
};

const setup = (opts: SetupOpts = {}) =>
  render(
    <ResizableSidePanel storageKey={STORAGE_KEY} {...opts}>
      <div>{"Panel content"}</div>
    </ResizableSidePanel>,
  );

const resize = (width: number) =>
  act(() => {
    latestResizableBoxProps?.onResize?.(FAKE_EVENT, makeResizeData(width));
  });

const startResize = (width: number) =>
  act(() => {
    latestResizableBoxProps?.onResizeStart?.(FAKE_EVENT, makeResizeData(width));
  });

const stopResize = (width: number) =>
  act(() => {
    latestResizableBoxProps?.onResizeStop?.(FAKE_EVENT, makeResizeData(width));
  });

describe("ResizableSidePanel", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
    localStorage.clear();
  });

  it("matches the design spec sizes and limits", () => {
    expect(SIDE_PANEL_SIZES).toEqual({ sm: 256, md: 320, lg: 400, xl: 480 });
    expect(SIDE_PANEL_MIN_WIDTH).toBe(224);
    expect(SIDE_PANEL_MAX_WIDTH).toBe(384);
  });

  it("starts at the medium preset by default", () => {
    setup();

    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(latestResizableBoxProps?.width).toBe(SIDE_PANEL_SIZES.md);
  });

  it("starts at the requested preset", () => {
    setup({ defaultSize: "sm" });

    expect(latestResizableBoxProps?.width).toBe(SIDE_PANEL_SIZES.sm);
  });

  it("clamps between the shared min and max widths", () => {
    setup();

    expect(latestResizableBoxProps?.minConstraints).toEqual([
      SIDE_PANEL_MIN_WIDTH,
      0,
    ]);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([
      SIDE_PANEL_MAX_WIDTH,
      0,
    ]);
  });

  it("raises the max width to the requested preset via maxSize", () => {
    setup({ maxSize: "xl" });

    expect(latestResizableBoxProps?.maxConstraints).toEqual([
      SIDE_PANEL_SIZES.xl,
      0,
    ]);
  });

  it("resizes from the right edge for a left panel and the left edge for a right panel", () => {
    const { rerender } = setup({ side: "left" });
    expect(latestResizableBoxProps?.resizeHandles).toEqual(["e"]);

    rerender(
      <ResizableSidePanel storageKey={STORAGE_KEY} side="right">
        <div>{"Panel content"}</div>
      </ResizableSidePanel>,
    );
    expect(latestResizableBoxProps?.resizeHandles).toEqual(["w"]);
  });

  it("updates its width as the user drags", () => {
    const onResize = jest.fn();
    setup({ onResize });

    resize(360);

    expect(onResize).toHaveBeenCalledWith(360);
    expect(latestResizableBoxProps?.width).toBe(360);
  });

  it("defers to a controlled width and reports drags through onResize", () => {
    const onResize = jest.fn();
    render(
      <ResizableSidePanel width={300} onResize={onResize}>
        <div>{"Panel content"}</div>
      </ResizableSidePanel>,
    );

    expect(latestResizableBoxProps?.width).toBe(300);

    resize(350);

    expect(onResize).toHaveBeenCalledWith(350);
    expect(latestResizableBoxProps?.width).toBe(300);
  });

  it("disables text selection on the body while resizing", () => {
    const onResizeStop = jest.fn();
    setup({ onResizeStop });

    expect(document.body.className).toBe("");

    startResize(320);
    expect(document.body.className).not.toBe("");

    stopResize(360);
    expect(document.body.className).toBe("");
    expect(onResizeStop).toHaveBeenCalledWith(360);
  });

  it("renders a resize handle with no visible content by default", () => {
    setup();

    const handle = latestResizableBoxProps?.handle;
    if (!isValidElement(handle)) {
      throw new Error("Expected a handle element");
    }
    render(handle);

    expect(
      screen.getByTestId("side-panel-resize-handle"),
    ).toBeEmptyDOMElement();
  });

  describe("remembering the user's width", () => {
    it("starts at the width the user last resized the panel to", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 360);

      setup();

      expect(latestResizableBoxProps?.width).toBe(360);
    });

    it("clamps a remembered width to the panel's current max width", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 460);

      setup();

      expect(latestResizableBoxProps?.width).toBe(SIDE_PANEL_MAX_WIDTH);
    });

    it("lets panels with a larger max width keep a wider remembered width", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 460);

      setup({ defaultSize: "lg", maxSize: "xl" });

      expect(latestResizableBoxProps?.width).toBe(460);
    });

    it("remembers the width once the user stops resizing", () => {
      setup();

      resize(360);
      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBeUndefined();

      stopResize(360);
      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBe(360);
    });

    it("forgets the width when the panel is resized back to its default", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 360);
      setup();

      stopResize(SIDE_PANEL_SIZES.md);

      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBeUndefined();
    });

    it("compares against the panel's own default preset", () => {
      setup({ defaultSize: "sm" });

      stopResize(SIDE_PANEL_SIZES.md);

      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBe(SIDE_PANEL_SIZES.md);
    });
  });
});
