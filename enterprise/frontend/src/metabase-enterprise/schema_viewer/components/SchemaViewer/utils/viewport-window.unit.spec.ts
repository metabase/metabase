import type { SchemaViewerFlowEdge } from "../types";

import { makeFlowNode } from "./test-utils";
import {
  getGraphBounds,
  getNodeIdsInViewportWindow,
  getRenderedGraph,
} from "./viewport-window";

const SETTLED_ORIGIN = {
  viewport: { x: 0, y: 0, zoom: 1 },
  size: { width: 1000, height: 500 },
};

function makeEdge(source: string, target: string): SchemaViewerFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: "schemaViewerEdge",
    data: { relationship: "many-to-one" },
  };
}

function sorted(ids: ReadonlySet<string>) {
  return [...ids].sort();
}

describe("getNodeIdsInViewportWindow", () => {
  it("includes nodes within the requested number of overscan viewports", () => {
    // Viewport covers x in [0, 1000]; two viewports of overscan extend it to
    // [-2000, 3000]. Nodes are 320px wide.
    const nodes = [
      makeFlowNode({ id: 1, position: { x: -2300, y: 0 } }), // right edge -1980: inside
      makeFlowNode({ id: 2, position: { x: -2400, y: 0 } }), // right edge -2080: outside
      makeFlowNode({ id: 3, position: { x: 2900, y: 0 } }), // inside
      makeFlowNode({ id: 4, position: { x: 3100, y: 0 } }), // outside
    ];

    expect(
      sorted(getNodeIdsInViewportWindow(nodes, SETTLED_ORIGIN, 2)),
    ).toEqual(["table-1", "table-3"]);
    expect(
      sorted(getNodeIdsInViewportWindow(nodes, SETTLED_ORIGIN, 1)),
    ).toEqual([]);
  });

  it("returns no nodes for invalid container geometry", () => {
    const nodes = [makeFlowNode({ id: 1, position: { x: 0, y: 0 } })];

    expect(
      getNodeIdsInViewportWindow(
        nodes,
        { ...SETTLED_ORIGIN, size: { width: 0, height: 500 } },
        2,
      ).size,
    ).toBe(0);
  });
});

describe("getRenderedGraph", () => {
  it("keeps rendered nodes and every edge with at least one rendered endpoint", () => {
    const nodes = [
      makeFlowNode({ id: 1 }),
      makeFlowNode({ id: 2 }),
      makeFlowNode({ id: 3 }),
      makeFlowNode({ id: 4 }),
    ];
    const insideEdge = makeEdge("table-1", "table-2");
    const crossingEdge = makeEdge("table-2", "table-3");
    const outsideEdge = makeEdge("table-3", "table-4");

    const { nodes: windowNodes, edges: windowEdges } = getRenderedGraph(
      nodes,
      [insideEdge, crossingEdge, outsideEdge],
      new Set(["table-1", "table-2"]),
    );

    expect(windowNodes.map((node) => node.id)).toEqual(["table-1", "table-2"]);
    expect(windowEdges).toEqual([insideEdge, crossingEdge]);
  });
});

describe("getGraphBounds", () => {
  it("spans every logical node using its fixed dimensions", () => {
    const nodes = [
      makeFlowNode({ id: 1, position: { x: -100, y: 50 }, height: 200 }),
      makeFlowNode({ id: 2, position: { x: 400, y: -20 }, height: 100 }),
    ];

    expect(getGraphBounds(nodes)).toEqual({
      x: -100,
      y: -20,
      width: 820,
      height: 270,
    });
  });
});
