import type { ResizableProps } from "react-resizable";

import { act, render, screen } from "__support__/ui";

import { SidebarResizableBox } from "./SidebarResizableBox";

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

describe("SidebarResizableBox", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
  });

  it("keeps the user-resized width when the container width changes", () => {
    const { rerender } = render(
      <SidebarResizableBox
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
      latestResizableBoxProps?.onResize?.({} as React.SyntheticEvent, {
        size: { width: 600, height: 0 },
        node: {} as HTMLElement,
        handle: "w",
      });
    });

    rerender(
      <SidebarResizableBox
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
});
