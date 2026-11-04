import type { ResizableProps, ResizeCallbackData } from "react-resizable";

import { act, render, screen } from "__support__/ui";

import { ResizableSummaryPanel } from "./ResizableSummaryPanel";

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

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
  return { rerender };
}

type ResizeCallbackName = "onResizeStart" | "onResize" | "onResizeStop";

function fireResizeCallback(name: ResizeCallbackName, width: number) {
  act(() => {
    latestResizableBoxProps?.[name]?.(
      // react-resizable's callbacks require an event; the panel ignores it
      {} as React.SyntheticEvent,
      {
        size: { width, height: 0 },
        node: document.createElement("div"),
        handle: "w",
      } satisfies ResizeCallbackData,
    );
  });
}

describe("ResizableSummaryPanel", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
  });

  it("starts at 650px and leaves the results at least 320px", () => {
    setup({ containerWidth: 1200 });

    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(latestResizableBoxProps?.width).toBe(650);
    expect(latestResizableBoxProps?.minConstraints).toEqual([320, 0]);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([880, 0]);
  });

  it("keeps the default width while the container has not been measured", () => {
    setup({ containerWidth: 0 });

    expect(latestResizableBoxProps?.width).toBe(650);
  });

  it("keeps the resized width, clamped to what the results leave it", () => {
    const { rerender } = setup({ containerWidth: 1200 });

    fireResizeCallback("onResize", 800);
    expect(latestResizableBoxProps?.width).toBe(800);

    rerender({ containerWidth: 1000 });
    expect(latestResizableBoxProps?.width).toBe(680);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([680, 0]);

    rerender({ containerWidth: 1200 });
    expect(latestResizableBoxProps?.width).toBe(800);
  });

  it("never clamps below its own minimum width", () => {
    setup({ containerWidth: 500 });

    expect(latestResizableBoxProps?.width).toBe(320);
    expect(latestResizableBoxProps?.maxConstraints).toEqual([320, 0]);
  });

  it("marks its content and the page while resizing", () => {
    setup({ containerWidth: 1200 });
    const content = screen.getByTestId("summary-panel");
    expect(content).not.toHaveAttribute("data-resizing");

    fireResizeCallback("onResizeStart", 650);
    expect(content).toHaveAttribute("data-resizing");
    expect(document.body.className).not.toBe("");

    fireResizeCallback("onResizeStop", 650);
    expect(content).not.toHaveAttribute("data-resizing");
    expect(document.body.className).toBe("");
  });
});
