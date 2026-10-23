import type { NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";

import { queryIcon, renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { ConcreteTableId, TableVisibilityType } from "metabase-types/api";
import {
  createMockErdEdge,
  createMockErdField,
  createMockErdNode,
  createMockErdResponse,
} from "metabase-types/api/mocks";

import { SchemaViewerContext } from "../../SchemaViewerContext";
import { createSchemaViewerDetailsStore } from "../../hooks/useSchemaViewerDetails";
import type { SchemaViewerFlowNode } from "../../types";
import { toFlowGraph } from "../../utils/flow-graph";

import { SchemaViewerTableNode } from "./SchemaViewerTableNode";

function nodeProps(
  node: SchemaViewerFlowNode,
): NodeProps<SchemaViewerFlowNode> {
  return {
    id: node.id,
    data: node.data,
    type: "schemaViewerTable",
    dragging: false,
    zIndex: 2,
    selectable: true,
    deletable: false,
    selected: false,
    draggable: true,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
}

function setup({
  visibilityType = null,
  isDetailed = false,
}: {
  visibilityType?: TableVisibilityType;
  isDetailed?: boolean;
} = {}) {
  const erdNode = createMockErdNode({
    table_id: 1,
    name: "Orders",
    visibility_type: visibilityType,
    fields: [
      createMockErdField({
        id: 11,
        name: "customer_id",
        semantic_type: "type/FK",
      }),
      createMockErdField({ id: 12, name: "total", semantic_type: null }),
    ],
  });
  const [node] = toFlowGraph(
    createMockErdResponse({
      nodes: [erdNode],
      edges: [
        createMockErdEdge({
          source_table_id: 1,
          source_field_id: 11,
          target_table_id: 2,
          target_field_id: 21,
        }),
      ],
    }),
  ).nodes;

  const detailsStore = createSchemaViewerDetailsStore();
  detailsStore.setDetailedNodeIds(
    isDetailed ? new Set([node.id]) : new Set<string>(),
  );
  const value = {
    visibleTableIds: new Set<ConcreteTableId>(),
    detailsStore,
    expandingTableIds: new Set<ConcreteTableId>(),
    expandToTable: jest.fn(),
    selectedNodeId: null,
    selectNode: jest.fn(),
    zoomToNode: jest.fn(),
    selectEdges: jest.fn(),
  };

  const view = renderWithProviders(
    <ReactFlowProvider>
      <SchemaViewerContext.Provider value={value}>
        <SchemaViewerTableNode {...nodeProps(node)} />
      </SchemaViewerContext.Provider>
    </ReactFlowProvider>,
  );

  return { ...view, node };
}

describe("SchemaViewerTableNode", () => {
  it("renders the hidden indicator for tables with a visibility_type", () => {
    setup({ visibilityType: "hidden" });
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(queryIcon("eye_crossed_out")).toBeInTheDocument();
  });

  it("does not render the hidden indicator for normal tables", () => {
    setup({ visibilityType: null });
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(queryIcon("eye_crossed_out")).not.toBeInTheDocument();
  });

  it.each([
    { level: "summary", isDetailed: false },
    { level: "full", isDetailed: true },
  ])(
    "shows field and foreign key counts in the $level header",
    ({ isDetailed }) => {
      setup({ isDetailed });

      const header = checkNotNull(screen.getByText("Orders").parentElement);
      expect(
        within(header).getByRole("group", { name: "2 fields" }),
      ).toHaveTextContent("2");
      expect(
        within(header).getByRole("group", { name: "1 foreign key" }),
      ).toHaveTextContent("1");
      expect(within(header).getByLabelText("field icon")).toBeInTheDocument();
      expect(
        within(header).getByLabelText("connections icon"),
      ).toBeInTheDocument();
    },
  );

  it("renders a summary without field rows", () => {
    const { container } = setup();

    const summary = container.querySelector("[data-detail-level='summary']");
    expect(summary).toBe(
      screen.getByText("Orders").closest("[data-detail-level]"),
    );
    expect(screen.queryByText("customer_id")).not.toBeInTheDocument();
    expect(screen.queryByText("total")).not.toBeInTheDocument();
  });

  it("renders an identical header at both detail levels", () => {
    const summary = setup({ visibilityType: "hidden" });
    const summaryHeader = screen.getByText("Orders").parentElement?.outerHTML;
    summary.unmount();

    setup({ visibilityType: "hidden", isDetailed: true });
    const fullHeader = screen.getByText("Orders").parentElement?.outerHTML;

    expect(summaryHeader).toBeDefined();
    expect(fullHeader).toBe(summaryHeader);
  });

  it("renders all field rows for a detailed node", () => {
    const { container } = setup({ isDetailed: true });

    expect(screen.getByText("customer_id")).toBeInTheDocument();
    expect(screen.getByText("total")).toBeInTheDocument();
    expect(screen.queryByText("2 fields")).not.toBeInTheDocument();
    expect(container.querySelector("[data-detail-level='full']")).toBe(
      screen.getByText("Orders").closest("[data-detail-level]"),
    );
  });

  it("pre-populates measured dimensions and foreignKeyCount on the flow node", () => {
    const { node } = setup();

    expect(node.measured).toEqual({
      width: node.width,
      height: node.height,
    });
    expect(node.data.foreignKeyCount).toBe(1);
  });
});
