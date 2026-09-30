import { act, render, screen } from "__support__/ui";
import {
  type ResizableSidePanelProps,
  getStoredSidePanelWidth,
  setStoredSidePanelWidth,
} from "metabase/common/components/ResizableSidePanel";

import { ViewSidebar } from "./ViewSidebar";

const STORAGE_KEY = "test-sidebar";

let mockPanelProps: ResizableSidePanelProps | null = null;

jest.mock("metabase/common/components/ResizableSidePanel", () => ({
  ...jest.requireActual("metabase/common/components/ResizableSidePanel"),
  ResizableSidePanel: (props: ResizableSidePanelProps) => {
    mockPanelProps = props;
    return <div data-testid="resizable-side-panel">{props.children}</div>;
  },
}));

type SetupOpts = {
  side?: "left" | "right";
  storageKey?: string;
  width?: number;
  isOpen?: boolean;
};

const renderSidebar = ({
  side = "right",
  storageKey = STORAGE_KEY,
  width,
  isOpen = true,
}: SetupOpts) => (
  <ViewSidebar
    side={side}
    storageKey={storageKey}
    width={width}
    isOpen={isOpen}
  >
    <div>{"Sidebar content"}</div>
  </ViewSidebar>
);

const setup = (opts: SetupOpts = {}) => {
  const view = render(renderSidebar(opts));
  const rerender = (newOpts: SetupOpts) =>
    view.rerender(renderSidebar({ ...opts, ...newOpts }));
  return { ...view, rerender };
};

describe("ViewSidebar", () => {
  beforeEach(() => {
    mockPanelProps = null;
    localStorage.clear();
  });

  it("is resizable from its inner edge when open", () => {
    setup({ side: "left", width: 355 });

    expect(screen.getByTestId("resizable-side-panel")).toHaveTextContent(
      "Sidebar content",
    );
    expect(mockPanelProps?.side).toBe("left");
    expect(mockPanelProps?.width).toBe(355);
  });

  it("is not resizable when closed", () => {
    setup({ width: 355, isOpen: false });

    expect(screen.getByText("Sidebar content")).toBeInTheDocument();
    expect(
      screen.queryByTestId("resizable-side-panel"),
    ).not.toBeInTheDocument();
  });

  it("is not resizable when open at zero width", () => {
    setup({ width: 0 });

    expect(screen.getByText("Sidebar content")).toBeInTheDocument();
    expect(
      screen.queryByTestId("resizable-side-panel"),
    ).not.toBeInTheDocument();
  });

  it("keeps the standard max width for sidebars no wider than 384px", () => {
    setup({ width: 355 });

    expect(mockPanelProps?.maxSize).toBeUndefined();
  });

  it("allows the xl max width for sidebars wider than 384px", () => {
    setup({ width: 400 });

    expect(mockPanelProps?.maxSize).toBe("xl");
  });

  it("keeps the user's width until the caller changes the width prop", () => {
    const { rerender } = setup({ width: 355 });

    act(() => mockPanelProps?.onResize?.(300));
    expect(mockPanelProps?.width).toBe(300);

    rerender({ width: 355 });
    expect(mockPanelProps?.width).toBe(300);

    rerender({ width: 400 });
    expect(mockPanelProps?.width).toBe(400);
  });

  describe("remembering the user's width", () => {
    it("opens at the width the user last resized this sidebar to", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 300);

      setup({ width: 355 });

      expect(mockPanelProps?.width).toBe(300);
    });

    it("remembers the width once the user stops resizing", () => {
      setup({ width: 355 });

      act(() => mockPanelProps?.onResizeStop?.(300));

      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBe(300);
    });

    it("forgets the width when resized back to the sidebar's default", () => {
      setStoredSidePanelWidth(STORAGE_KEY, 300);
      setup({ width: 355 });

      act(() => mockPanelProps?.onResizeStop?.(355));

      expect(getStoredSidePanelWidth(STORAGE_KEY)).toBeUndefined();
    });

    it("switches to the remembered width of the sidebar being shown", () => {
      setStoredSidePanelWidth("other-sidebar", 260);
      const { rerender } = setup({ width: 355 });

      rerender({ storageKey: "other-sidebar", width: 300 });

      expect(mockPanelProps?.width).toBe(260);
    });

    it("does not apply a remembered width to a zero-width frame", () => {
      const withoutStoredWidth = setup({ width: 0 });
      const expectedWidth = screen.getByTestId("sidebar-right").style.width;
      withoutStoredWidth.unmount();

      setStoredSidePanelWidth(STORAGE_KEY, 300);
      setup({ width: 0 });

      expect(screen.getByTestId("sidebar-right").style.width).toBe(
        expectedWidth,
      );
    });
  });
});
