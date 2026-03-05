import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import type { EdgeProps } from "@xyflow/react";

import type { SchemaViewerEdgeData } from "../types";

import { SchemaViewerEdge } from "./SchemaViewerEdge";

const renderWithProvider = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

// Mock hooks
jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useNodesInitialized: () => true,
  getSmoothStepPath: () => ["M 100 200 L 300 400"],
}));

jest.mock("metabase/common/hooks/use-palette", () => ({
  usePalette: () => ({
    border: "#CCCCCC",
  }),
}));

jest.mock("../SchemaViewerContext", () => ({
  useIsCompactMode: () => false,
}));

const createEdgeProps = (
  overrides?: Partial<EdgeProps<SchemaViewerEdgeData>>,
): EdgeProps<SchemaViewerEdgeData> => ({
  id: "edge-1",
  source: "table-1",
  target: "table-2",
  sourceX: 100,
  sourceY: 200,
  targetX: 300,
  targetY: 400,
  sourcePosition: "right" as const,
  targetPosition: "left" as const,
  data: {
    relationship: "many-to-one",
  },
  ...overrides,
});

describe("SchemaViewerEdge", () => {
  describe("getSymbolTypes mapping", () => {
    it("should map 'one-to-one' to one:one symbols", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "one-to-one" },
            })}
          />
        </svg>,
      );

      // Both source and target should have single line symbols (one-to-one)
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should map 'many-to-one' to many:one symbols", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      // Should have crow's foot on source side (many) and single line on target (one)
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should handle missing relationship data", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: undefined,
            })}
          />
        </svg>,
      );

      // Should default to many-to-one
      expect(container.querySelector("path")).toBeInTheDocument();
    });
  });

  describe("crow's foot symbol rendering", () => {
    it("should render symbols for one-to-one relationship", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "one-to-one" },
            })}
          />
        </svg>,
      );

      // One-to-one has single vertical lines on both sides
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it("should render symbols for many-to-one relationship", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      // Many-to-one has crow's foot (2 angled lines) on source side
      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThanOrEqual(3); // 2 for crow's foot + 1 for target
    });

    it("should render edge path", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute("d");
    });
  });

  describe("self-referencing edge handling", () => {
    it("should use custom path for self-referencing edges", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              source: "table-1",
              target: "table-1",
              sourceX: 100,
              sourceY: 200,
              targetX: 100,
              targetY: 250,
            })}
          />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toBeInTheDocument();
      // Self-ref edges use custom path calculation
      expect(path).toHaveAttribute("d");
    });

    it("should create curved path for self-referencing edges", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              source: "table-1",
              target: "table-1",
              sourceX: 100,
              sourceY: 200,
              targetX: 100,
              targetY: 250,
            })}
          />
        </svg>,
      );

      const path = container.querySelector("path");
      const d = path?.getAttribute("d");

      // Should contain quadratic curve commands (Q)
      expect(d).toContain("Q");
      // Should contain line commands (L)
      expect(d).toContain("L");
    });

    it("should render symbols for self-referencing edges", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              source: "table-1",
              target: "table-1",
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      const lines = container.querySelectorAll("line");
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe("edge path calculation", () => {
    it("should render path for non-self-ref edges", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              sourceX: 0,
              sourceY: 0,
              targetX: 100,
              targetY: 100,
            })}
          />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toHaveAttribute("d");
      expect(path?.getAttribute("d")).toBeTruthy();
    });

    it("should handle different source/target positions", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              sourceX: 500,
              sourceY: 300,
              targetX: 100,
              targetY: 150,
              sourcePosition: "left" as const,
              targetPosition: "right" as const,
            })}
          />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toBeInTheDocument();
      expect(path?.getAttribute("d")).toBeTruthy();
    });
  });

  describe("CSS classes", () => {
    it("should apply react-flow__edge-path class", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toHaveClass("react-flow__edge-path");
    });

    it("should apply animation class", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      const path = container.querySelector("path");
      expect(path).toHaveClass("schema-viewer-edge-march");
    });
  });

  describe("relationship types", () => {
    it("should handle one-to-one relationship", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "one-to-one" },
            })}
          />
        </svg>,
      );

      const lines = container.querySelectorAll("line");
      // One-to-one: 1 source line + 1 target line = 2 lines minimum
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle many-to-one relationship", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      const lines = container.querySelectorAll("line");
      // Many-to-one: 2 source crow's foot lines + 1 target line = 3 lines minimum
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("edge rendering", () => {
    it("should render edge with path element", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      expect(container.querySelector("path")).toBeInTheDocument();
    });

    it("should render symbol group", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      expect(container.querySelector("g")).toBeInTheDocument();
    });

    it("should render with correct structure", () => {
      const { container } = renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      // Should have path and symbol group
      expect(container.querySelector("path")).toBeInTheDocument();
      expect(container.querySelector("g")).toBeInTheDocument();
      // Should have lines for symbols
      expect(container.querySelectorAll("line").length).toBeGreaterThan(0);
    });
  });
});
