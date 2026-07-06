import { useState } from "react";
import type { ResizableProps, ResizeCallbackData } from "react-resizable";

import { act, renderWithProviders, screen } from "__support__/ui";

import { MonitorContent } from "./MonitorContent";
import { Sidebar } from "./Sidebar";

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

// AppSwitcher pulls in redux/settings we don't need for the resize side effect.
jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => null,
}));

const RESIZE_EVENT = {} as React.SyntheticEvent;
const RESIZE_DATA: ResizeCallbackData = {
  size: { width: 512, height: 0 },
  node: {} as HTMLElement,
  handle: "w",
};

function getContainerNode() {
  // The Sidebar toggles the resizing class on the sidebar region's parent
  // (the Monitor content container).
  const container = screen.getByTestId("monitor-sidebar-region").parentElement;
  if (container == null) {
    throw new Error("expected a container node for the sidebar region");
  }
  return container;
}

describe("Sidebar resize side effect", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
  });

  it("adds the resizing class while dragging and removes it on stop", () => {
    renderWithProviders(
      <MonitorContent>
        <Sidebar containerWidth={1000}>
          <div data-testid="sidebar-content">{"Sidebar"}</div>
        </Sidebar>
      </MonitorContent>,
    );

    const container = getContainerNode();
    const baseTokens = [...container.classList];

    act(() =>
      latestResizableBoxProps?.onResizeStart?.(RESIZE_EVENT, RESIZE_DATA),
    );

    const draggingTokens = [...container.classList];
    const added = draggingTokens.filter((t) => !baseTokens.includes(t));
    expect(added).toHaveLength(1);

    act(() =>
      latestResizableBoxProps?.onResizeStop?.(RESIZE_EVENT, RESIZE_DATA),
    );

    expect([...container.classList]).toEqual(baseTokens);
  });

  it("removes the resizing class when the sidebar unmounts mid-drag", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <MonitorContent>
          <button onClick={() => setOpen(false)}>{"Close"}</button>
          {open && (
            <Sidebar containerWidth={1000}>
              <div data-testid="sidebar-content">{"Sidebar"}</div>
            </Sidebar>
          )}
        </MonitorContent>
      );
    }

    renderWithProviders(<Harness />);

    const container = getContainerNode();
    const baseTokens = [...container.classList];

    act(() =>
      latestResizableBoxProps?.onResizeStart?.(RESIZE_EVENT, RESIZE_DATA),
    );
    expect([...container.classList].length).toBeGreaterThan(baseTokens.length);

    // Sidebar unmounts while still dragging -> the class must not leak.
    act(() => {
      screen.getByRole("button", { name: "Close" }).click();
    });

    expect([...container.classList]).toEqual(baseTokens);
    expect(screen.queryByTestId("sidebar-content")).not.toBeInTheDocument();
  });
});
