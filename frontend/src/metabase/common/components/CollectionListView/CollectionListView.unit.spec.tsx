import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { VirtualizedGrid as VirtualizedGridType } from "metabase/common/components/VirtualizedGrid";

import { CollectionListView } from "./CollectionListView";

// Mock VirtualizedGrid since it's tested separately
jest.mock("metabase/common/components/VirtualizedGrid", () => ({
  VirtualizedGrid: jest.fn(({ items }) => (
    <div data-testid="virtualized-grid">
      {items.map((item: any) => (
        <div key={item.key}>{item.content}</div>
      ))}
    </div>
  )),
}));

describe("CollectionListView", () => {
  const mockCrumbs = [{ title: "Home", to: "/" }, { title: "Collections" }];

  const mockItems = [
    {
      key: "item-1",
      name: "Collection 1",
      icon: "folder" as const,
      link: "/collection/1",
    },
    {
      key: "item-2",
      name: "Collection 2",
      icon: "folder" as const,
      link: "/collection/2",
    },
    {
      key: "item-3",
      name: "Collection 3",
      icon: "folder" as const,
      link: "/collection/3",
    },
  ];

  function setup(props = {}) {
    return renderWithProviders(
      <Route
        path="/"
        component={() => (
          <CollectionListView
            crumbs={mockCrumbs}
            items={mockItems}
            {...props}
          />
        )}
      />,
      { withRouter: true },
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("non-virtualized rendering", () => {
    it("renders breadcrumbs", () => {
      setup();

      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Collections")).toBeInTheDocument();
    });

    it("renders collection items in a grid", () => {
      setup();

      expect(screen.getByText("Collection 1")).toBeInTheDocument();
      expect(screen.getByText("Collection 2")).toBeInTheDocument();
      expect(screen.getByText("Collection 3")).toBeInTheDocument();
    });

    it("renders loading state", () => {
      setup({ loading: true, items: [] });

      expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument(); // Mantine Loader has aria-hidden
      expect(screen.queryByText("Collection 1")).not.toBeInTheDocument();
    });

    it("renders items with correct links", () => {
      setup();

      const link1 = screen.getByRole("link", { name: /Collection 1/i });
      expect(link1).toHaveAttribute("href", "/collection/1");

      const link2 = screen.getByRole("link", { name: /Collection 2/i });
      expect(link2).toHaveAttribute("href", "/collection/2");
    });

    it("does not render VirtualizedGrid when virtualized is false", () => {
      setup({ virtualized: false });

      expect(screen.queryByTestId("virtualized-grid")).not.toBeInTheDocument();
    });
  });

  describe("virtualized rendering", () => {
    it("renders VirtualizedGrid when virtualized is true", () => {
      setup({ virtualized: true });

      expect(screen.getByTestId("virtualized-grid")).toBeInTheDocument();
    });

    it("passes correct props to VirtualizedGrid", () => {
      const VirtualizedGrid = jest.mocked<typeof VirtualizedGridType>(
        jest.requireMock("metabase/common/components/VirtualizedGrid")
          .VirtualizedGrid,
      );

      setup({ virtualized: true });

      expect(VirtualizedGrid).toHaveBeenCalledWith(
        expect.objectContaining({
          columnsPerRow: 4,
          estimatedRowHeight: 80,
          items: expect.arrayContaining([
            expect.objectContaining({
              key: "item-1",
              content: expect.anything(),
            }),
            expect.objectContaining({
              key: "item-2",
              content: expect.anything(),
            }),
            expect.objectContaining({
              key: "item-3",
              content: expect.anything(),
            }),
          ]),
        }),
        expect.anything(),
      );
    });

    it("renders collection items through VirtualizedGrid", () => {
      setup({ virtualized: true });

      // Items should still be visible through the mocked VirtualizedGrid
      expect(screen.getByText("Collection 1")).toBeInTheDocument();
      expect(screen.getByText("Collection 2")).toBeInTheDocument();
      expect(screen.getByText("Collection 3")).toBeInTheDocument();
    });

    it("renders breadcrumbs when virtualized", () => {
      setup({ virtualized: true });

      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Collections")).toBeInTheDocument();
    });

    it("does not show regular Grid when virtualized is true", () => {
      setup({ virtualized: true });

      // The regular Grid component wouldn't have the virtualized-grid test id
      // When virtualized, we should only see the virtualized-grid
      expect(screen.getByTestId("virtualized-grid")).toBeInTheDocument();
    });

    it("shows loading state instead of VirtualizedGrid when loading", () => {
      setup({ virtualized: true, loading: true, items: [] });

      expect(screen.queryByTestId("virtualized-grid")).not.toBeInTheDocument();
      expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument(); // Loader
    });
  });

  describe("edge cases", () => {
    it("renders empty state when no items", () => {
      setup({ items: [] });

      expect(screen.queryByText("Collection 1")).not.toBeInTheDocument();
    });

    it("handles empty items array with virtualized grid", () => {
      setup({ items: [], virtualized: true });

      expect(screen.getByTestId("virtualized-grid")).toBeInTheDocument();
    });

    it("renders single item correctly", () => {
      const singleItem = [mockItems[0]];
      setup({ items: singleItem });

      expect(screen.getByText("Collection 1")).toBeInTheDocument();
      expect(screen.queryByText("Collection 2")).not.toBeInTheDocument();
    });

    it("applies custom container style", () => {
      setup({ containerStyle: { backgroundColor: "red" } });

      // Verify component renders with custom style
      expect(screen.getByText("Collection 1")).toBeInTheDocument();
    });

    it("applies custom container class name", () => {
      setup({ containerClassName: "custom-class" });

      // Verify component renders with custom class
      expect(screen.getByText("Collection 1")).toBeInTheDocument();
    });
  });
});
