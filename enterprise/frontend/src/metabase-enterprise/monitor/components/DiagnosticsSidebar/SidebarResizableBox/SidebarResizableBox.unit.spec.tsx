import type { ReactNode } from "react";

import { act, render, screen } from "__support__/ui";

import { SidebarResizableBox } from "./SidebarResizableBox";

type ResizeData = {
  size: {
    width: number;
    height: number;
  };
};

type ResizableBoxProps = {
  width: number;
  height?: number;
  maxConstraints?: [number, number];
  onResize?: (event: React.SyntheticEvent, data: ResizeData) => void;
  children?: ReactNode;
};

let latestResizableBoxProps: ResizableBoxProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableBoxProps) => {
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
      });
    });

    rerender(
      <SidebarResizableBox
        containerWidth={1000}
        onResizeStart={jest.fn()}
        onResizeStop={jest.fn()}
      >
        <div>{"Sidebar content"}</div>
      </SidebarResizableBox>,
    );

    expect(latestResizableBoxProps?.width).toBe(600);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([800, 0]);
  });
});
