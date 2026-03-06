import { Position } from "@xyflow/react";
import type { ComponentProps, ReactElement } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { SchemaViewerEdge } from "./SchemaViewerEdge";

type SchemaViewerEdgeProps = ComponentProps<typeof SchemaViewerEdge>;

const renderWithProvider = (component: ReactElement) => {
  return renderWithProviders(component);
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
  overrides?: Partial<SchemaViewerEdgeProps>,
): SchemaViewerEdgeProps => ({
  id: "edge-1",
  source: "table-1",
  target: "table-2",
  sourceX: 100,
  sourceY: 200,
  targetX: 300,
  targetY: 400,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  data: {
    relationship: "many-to-one",
  },
  ...overrides,
});

describe("SchemaViewerEdge", () => {
  describe("getSymbolTypes mapping", () => {
    it("should map 'one-to-one' to one:one symbols", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "one-to-one" },
            })}
          />
        </svg>,
      );

      // Both source and target should have single line symbols (one-to-one)
      const lines = screen.getAllByTestId("schema-viewer-edge-symbol-line");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should map 'many-to-one' to many:one symbols", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      // Should have crow's foot on source side (many) and single line on target (one)
      const lines = screen.getAllByTestId("schema-viewer-edge-symbol-line");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should handle missing relationship data", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: undefined,
            })}
          />
        </svg>,
      );

      // Should default to many-to-one
      expect(screen.getByTestId("schema-viewer-edge-path")).toBeInTheDocument();
    });
  });

  describe("self-referencing edge handling", () => {
    it("should use custom path for self-referencing edges", () => {
      renderWithProvider(
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

      const path = screen.getByTestId("schema-viewer-edge-path");
      expect(path).toBeInTheDocument();
      // Self-ref edges use custom path calculation
      expect(path).toHaveAttribute("d");
    });

    it("should create curved path for self-referencing edges", () => {
      renderWithProvider(
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

      const path = screen.getByTestId("schema-viewer-edge-path");
      const d = path?.getAttribute("d");

      // Should contain quadratic curve commands (Q)
      expect(d).toContain("Q");
      // Should contain line commands (L)
      expect(d).toContain("L");
    });

    it("should render symbols for self-referencing edges", () => {
      renderWithProvider(
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

      const lines = screen.getAllByTestId("schema-viewer-edge-symbol-line");
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe("edge path calculation", () => {
    it("should render path for non-self-ref edges", () => {
      renderWithProvider(
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

      const path = screen.getByTestId("schema-viewer-edge-path");
      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute("d", "M 100 200 L 300 400");
    });
  });

  describe("CSS classes", () => {
    it("should apply react-flow__edge-path class", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      const path = screen.getByTestId("schema-viewer-edge-path");
      expect(path).toHaveClass("react-flow__edge-path");
    });

    it("should apply animation class", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge {...createEdgeProps()} />
        </svg>,
      );

      const path = screen.getByTestId("schema-viewer-edge-path");
      expect(path).toHaveClass("schema-viewer-edge-march");
    });
  });

  describe("relationship types", () => {
    it("should handle one-to-one relationship", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "one-to-one" },
            })}
          />
        </svg>,
      );

      const lines = screen.getAllByTestId("schema-viewer-edge-symbol-line");
      // One-to-one: 1 source line + 1 target line = 2 lines minimum
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle many-to-one relationship", () => {
      renderWithProvider(
        <svg>
          <SchemaViewerEdge
            {...createEdgeProps({
              data: { relationship: "many-to-one" },
            })}
          />
        </svg>,
      );

      const lines = screen.getAllByTestId("schema-viewer-edge-symbol-line");
      // Many-to-one: 2 source crow's foot lines + 1 target line = 3 lines minimum
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });
  });
});
