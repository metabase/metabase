import type { ResizableProps, ResizeCallbackData } from "react-resizable";

import { act, render } from "__support__/ui";
import {
  getStoredSidePanelWidth,
  setStoredSidePanelWidth,
} from "metabase/common/components/ResizableSidePanel";

import { SidebarResizableBox } from "./SidebarResizableBox";

const STORAGE_KEY = "test-sidebar";

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

const makeResizeData = (width: number): ResizeCallbackData => ({
  size: { width, height: 0 },
  node: document.createElement("div"),
  handle: "w",
});

// react-resizable's callbacks require a SyntheticEvent, but the box never
// reads it, so an empty stand-in is sufficient for these tests.
const FAKE_EVENT = {} as React.SyntheticEvent;

const setup = () => {
  const onResizeStart = jest.fn();
  const onResizeStop = jest.fn();

  render(
    <SidebarResizableBox
      storageKey={STORAGE_KEY}
      containerWidth={1200}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <div>{"Sidebar content"}</div>
    </SidebarResizableBox>,
  );

  return { onResizeStart, onResizeStop };
};

describe("SidebarResizableBox", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
    localStorage.clear();
  });

  it("starts at the default width", () => {
    setup();

    expect(latestResizableBoxProps?.width).toBe(512);
  });

  it("starts at the width the user last resized the sidebar to", () => {
    setStoredSidePanelWidth(STORAGE_KEY, 600);

    setup();

    expect(latestResizableBoxProps?.width).toBe(600);
  });

  it("follows the user's drag", () => {
    setup();

    act(() => {
      latestResizableBoxProps?.onResize?.(FAKE_EVENT, makeResizeData(560));
    });

    expect(latestResizableBoxProps?.width).toBe(560);
  });

  it("remembers the width once the user stops resizing", () => {
    const { onResizeStop } = setup();

    act(() => {
      latestResizableBoxProps?.onResizeStop?.(FAKE_EVENT, makeResizeData(600));
    });

    expect(getStoredSidePanelWidth(STORAGE_KEY)).toBe(600);
    expect(onResizeStop).toHaveBeenCalled();
  });

  it("forgets the width when resized back to the default", () => {
    setStoredSidePanelWidth(STORAGE_KEY, 600);
    setup();

    act(() => {
      latestResizableBoxProps?.onResizeStop?.(FAKE_EVENT, makeResizeData(512));
    });

    expect(getStoredSidePanelWidth(STORAGE_KEY)).toBeUndefined();
  });

  it("reports when the user starts resizing", () => {
    const { onResizeStart } = setup();

    act(() => {
      latestResizableBoxProps?.onResizeStart?.(FAKE_EVENT, makeResizeData(512));
    });

    expect(onResizeStart).toHaveBeenCalled();
  });
});
