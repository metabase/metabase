import type { NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";

import { queryIcon, renderWithProviders, screen } from "__support__/ui";
import type { ConcreteTableId, TableVisibilityType } from "metabase-types/api";
import {
  createMockErdNode,
  createMockErdResponse,
} from "metabase-types/api/mocks";

import { SchemaViewerContext } from "../../SchemaViewerContext";
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
}: { visibilityType?: TableVisibilityType } = {}) {
  const erdNode = createMockErdNode({
    table_id: 1,
    name: "Orders",
    visibility_type: visibilityType,
  });
  const [node] = toFlowGraph(createMockErdResponse({ nodes: [erdNode] })).nodes;

  const value = {
    visibleTableIds: new Set<ConcreteTableId>(),
    expandingTableIds: new Set<ConcreteTableId>(),
    expandToTable: jest.fn(),
    selectedNodeId: null,
    selectNode: jest.fn(),
    zoomToNode: jest.fn(),
  };

  renderWithProviders(
    <ReactFlowProvider>
      <SchemaViewerContext.Provider value={value}>
        <SchemaViewerTableNode {...nodeProps(node)} />
      </SchemaViewerContext.Provider>
    </ReactFlowProvider>,
  );
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
});
