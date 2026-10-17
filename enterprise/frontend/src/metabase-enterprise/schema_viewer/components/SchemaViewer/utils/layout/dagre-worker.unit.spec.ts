import type { SchemaViewerFlowNode } from "../../types";
import { makeFlowNode } from "../test-utils";

import {
  applyDagrePositions,
  getDagreLayoutRequest,
  getDagrePositions,
  layoutWithDagre,
} from "./dagre-layout";
import type {
  DagreLayoutRequest,
  DagreNodePosition,
  LayoutEdge,
} from "./types";

function makeNode(
  id: string,
  dimensions: { width?: number; height?: number } = {},
): SchemaViewerFlowNode {
  return makeFlowNode({ id, fieldCount: 2, ...dimensions });
}

function toRequest(
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly LayoutEdge[],
): DagreLayoutRequest {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      width: node.width!,
      height: node.height!,
    })),
    edges,
  };
}

function expectFiniteNonOverlappingPositions(
  request: DagreLayoutRequest,
  positions: readonly DagreNodePosition[],
) {
  expect(positions.map(({ id }) => id).sort()).toEqual(
    request.nodes.map(({ id }) => id).sort(),
  );
  expect(new Set(positions.map(({ id }) => id)).size).toBe(
    request.nodes.length,
  );

  const dimensionsById = new Map(request.nodes.map((node) => [node.id, node]));
  for (const position of positions) {
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  }
  for (let first = 0; first < positions.length; first++) {
    for (let second = first + 1; second < positions.length; second++) {
      const a = positions[first];
      const b = positions[second];
      const aDimensions = dimensionsById.get(a.id)!;
      const bDimensions = dimensionsById.get(b.id)!;
      const overlaps =
        a.x < b.x + bDimensions.width &&
        a.x + aDimensions.width > b.x &&
        a.y < b.y + bDimensions.height &&
        a.y + aDimensions.height > b.y;
      expect(overlaps).toBe(false);
    }
  }
}

describe("getDagreLayoutRequest", () => {
  it("strips React Flow edge metadata from the worker payload", () => {
    const node = makeNode("table-1");
    const edge = {
      id: "edge-1-2",
      source: "table-1",
      target: "table-1",
      sourceHandle: "field-1",
      targetHandle: "field-2",
      selected: true,
      data: { relationship: "many-to-one" as const },
    };

    const request = getDagreLayoutRequest([node], [edge]);

    expect(request.edges).toEqual([{ source: "table-1", target: "table-1" }]);
    expect(request.edges[0]).not.toBe(edge);
  });
});

describe("getDagrePositions", () => {
  it.each([
    {
      name: "a single node",
      nodes: [makeNode("table-1")],
      edges: [],
    },
    {
      name: "connected and disconnected nodes",
      nodes: [makeNode("table-1"), makeNode("table-2"), makeNode("table-3")],
      edges: [{ source: "table-1", target: "table-2" }],
    },
    {
      name: "a cycle and self-reference",
      nodes: [makeNode("table-1"), makeNode("table-2")],
      edges: [
        { source: "table-1", target: "table-2" },
        { source: "table-2", target: "table-1" },
        { source: "table-1", target: "table-1" },
      ],
    },
    {
      name: "mixed node dimensions",
      nodes: [
        makeNode("table-1", { width: 260, height: 100 }),
        makeNode("table-2", { width: 320, height: 400 }),
        makeNode("table-3", { width: 500, height: 180 }),
      ],
      edges: [
        { source: "table-1", target: "table-2" },
        { source: "table-1", target: "table-3" },
      ],
    },
  ])(
    "returns one finite non-overlapping position for $name",
    ({ nodes, edges }) => {
      const request = toRequest(nodes, edges);

      expectFiniteNonOverlappingPositions(request, getDagrePositions(request));
    },
  );

  it("matches the synchronous React Flow node layout", () => {
    const nodes = [
      makeNode("table-1", { height: 100 }),
      makeNode("table-2", { height: 280 }),
      makeNode("table-3", { height: 160 }),
    ];
    const edges = [
      { source: "table-1", target: "table-2" },
      { source: "table-2", target: "table-3" },
    ];

    const positions = getDagrePositions(toRequest(nodes, edges));
    const positionedNodes = layoutWithDagre(nodes, edges);

    expect(
      positionedNodes.map(({ id, position }) => ({ id, ...position })),
    ).toEqual(positions);
  });

  it("arranges unrelated tables into a multi-column 2D grid rather than a single vertical column", () => {
    const nodes = Array.from({ length: 9 }, (_, index) =>
      makeNode(`table-${index + 1}`, { width: 260, height: 200 }),
    );
    const request = toRequest(nodes, []);

    const positions = getDagrePositions(request);

    expectFiniteNonOverlappingPositions(request, positions);
    const uniqueX = new Set(positions.map(({ x }) => x));
    const uniqueY = new Set(positions.map(({ y }) => y));
    expect(uniqueX.size).toBe(3);
    expect(uniqueY.size).toBe(3);
  });

  it("places larger connected components before smaller components and isolated tables while preserving left-to-right rank order", () => {
    const nodes = [
      makeNode("isolated-1"),
      makeNode("pair-src"),
      makeNode("pair-dst"),
      makeNode("isolated-2"),
      makeNode("chain-1"),
      makeNode("chain-2"),
      makeNode("chain-3"),
    ];
    const edges = [
      { source: "pair-src", target: "pair-dst" },
      { source: "chain-1", target: "chain-2" },
      { source: "chain-2", target: "chain-3" },
    ];
    const request = toRequest(nodes, edges);

    const positions = getDagrePositions(request);

    expectFiniteNonOverlappingPositions(request, positions);
    const byId = new Map(positions.map((pos) => [pos.id, pos]));
    const chain1 = byId.get("chain-1")!;
    const chain2 = byId.get("chain-2")!;
    const chain3 = byId.get("chain-3")!;
    const pairSrc = byId.get("pair-src")!;
    const pairDst = byId.get("pair-dst")!;
    const isolated1 = byId.get("isolated-1")!;

    expect(chain1.x).toBeLessThan(chain2.x);
    expect(chain2.x).toBeLessThan(chain3.x);
    expect(pairSrc.x).toBeLessThan(pairDst.x);

    // Largest connected component starts at the top-left origin ahead of isolated nodes
    expect(chain1.x).toBe(0);
    expect(chain1.y).toBe(0);
    expect(isolated1.y > chain1.y || isolated1.x > chain1.x).toBe(true);
  });
});

describe("applyDagrePositions", () => {
  it("preserves node order and data while applying positions", () => {
    const nodes = [makeNode("table-2"), makeNode("table-1")];

    const result = applyDagrePositions(nodes, [
      { id: "table-1", x: 10, y: 20 },
      { id: "table-2", x: 30, y: 40 },
    ]);

    expect(result.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "table-2", position: { x: 30, y: 40 } },
      { id: "table-1", position: { x: 10, y: 20 } },
    ]);
    expect(result[0].data).toBe(nodes[0].data);
    expect(result[0].width).toBe(nodes[0].width);
    expect(result[0].height).toBe(nodes[0].height);
    expect(result[0].style?.opacity).toBe(1);
  });

  it.each([
    {
      name: "a missing node",
      positions: [{ id: "table-1", x: 10, y: 20 }],
    },
    {
      name: "a duplicate node",
      positions: [
        { id: "table-1", x: 10, y: 20 },
        { id: "table-1", x: 30, y: 40 },
      ],
    },
    {
      name: "an unknown node",
      positions: [
        { id: "table-1", x: 10, y: 20 },
        { id: "table-3", x: 30, y: 40 },
      ],
    },
  ])("rejects positions containing $name", ({ positions }) => {
    expect(() =>
      applyDagrePositions(
        [makeNode("table-1"), makeNode("table-2")],
        positions,
      ),
    ).toThrow();
  });
});
