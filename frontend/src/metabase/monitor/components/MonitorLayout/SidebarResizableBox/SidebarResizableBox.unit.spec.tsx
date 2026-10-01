import type { ResizableProps, ResizeCallbackData } from "react-resizable";

import { act, render, screen } from "__support__/ui";
import {
  getStoredSidePanelWidth,
  setStoredSidePanelWidth,
} from "metabase/common/components/ResizableSidePanel";

import { SidebarResizableBox } from "./SidebarResizableBox";

const RESIZE_CALLBACK_DATA: ResizeCallbackData = {
  size: { width: 600, height: 0 },
  node: document.createElement("div"),
  handle: "w",
};

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

const renderBox = () =>
  render(
    <SidebarResizableBox
      storageKey="test-sidebar"
      containerWidth={1200}
      defaultWidth={512}
    >
      <div>{"Sidebar content"}</div>
    </SidebarResizableBox>,
  );

const stopResize = (width: number) =>
  act(() => {
    latestResizableBoxProps?.onResizeStop?.(
      // react-resizable's callbacks require an event; the component ignores it
      {} as React.SyntheticEvent,
      { ...RESIZE_CALLBACK_DATA, size: { width, height: 0 } },
    );
  });

describe("SidebarResizableBox", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
    localStorage.clear();
  });

  it("starts at the width the user last resized the sidebar to", () => {
    setStoredSidePanelWidth("test-sidebar", 600);

    renderBox();

    expect(latestResizableBoxProps?.width).toBe(600);
  });

  it("remembers the width once the user stops resizing", () => {
    renderBox();

    stopResize(600);

    expect(getStoredSidePanelWidth("test-sidebar")).toBe(600);
  });

  it("forgets the width when resized back to the default", () => {
    setStoredSidePanelWidth("test-sidebar", 600);
    renderBox();

    stopResize(512);

    expect(getStoredSidePanelWidth("test-sidebar")).toBeUndefined();
  });

  it("keeps the user-resized width when the container width changes", () => {
    const { rerender } = render(
      <SidebarResizableBox
        storageKey="test-sidebar"
        containerWidth={1200}
        defaultWidth={512}
        onResizeStart={jest.fn()}
        onResizeStop={jest.fn()}
      >
        <div>{"Sidebar content"}</div>
      </SidebarResizableBox>,
    );

    expect(screen.getByTestId("resizable-box")).toBeInTheDocument();
    act(() => {
      latestResizableBoxProps?.onResize?.(
        // react-resizable's callbacks require an event; the component ignores it
        {} as React.SyntheticEvent,
        RESIZE_CALLBACK_DATA,
      );
    });

    rerender(
      <SidebarResizableBox
        storageKey="test-sidebar"
        containerWidth={1000}
        defaultWidth={512}
        onResizeStart={jest.fn()}
        onResizeStop={jest.fn()}
      >
        <div>{"Sidebar content"}</div>
      </SidebarResizableBox>,
    );

    expect(latestResizableBoxProps?.width).toBe(600);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([800, 0]);
  });

  it("starts at the provided default width", () => {
    render(
      <SidebarResizableBox
        storageKey="test-sidebar"
        containerWidth={1200}
        defaultWidth={560}
        onResizeStart={jest.fn()}
        onResizeStop={jest.fn()}
      >
        <div>{"Sidebar content"}</div>
      </SidebarResizableBox>,
    );

    expect(latestResizableBoxProps?.width).toBe(560);
  });

  it("disables text selection on body while resizing", () => {
    const onResizeStart = jest.fn();
    const onResizeStop = jest.fn();

    render(
      <SidebarResizableBox
        storageKey="test-sidebar"
        containerWidth={1200}
        defaultWidth={512}
        onResizeStart={onResizeStart}
        onResizeStop={onResizeStop}
      >
        <div>{"Sidebar content"}</div>
      </SidebarResizableBox>,
    );

    expect(document.body.className).toBe("");

    act(() => {
      latestResizableBoxProps?.onResizeStart?.(
        // react-resizable's callbacks require an event; the component ignores it
        {} as React.SyntheticEvent,
        RESIZE_CALLBACK_DATA,
      );
    });

    expect(document.body.className).not.toBe("");
    expect(onResizeStart).toHaveBeenCalled();

    act(() => {
      latestResizableBoxProps?.onResizeStop?.(
        // react-resizable's callbacks require an event; the component ignores it
        {} as React.SyntheticEvent,
        RESIZE_CALLBACK_DATA,
      );
    });

    expect(document.body.className).toBe("");
    expect(onResizeStop).toHaveBeenCalled();
  });
});
