import type { SchemaViewerFlowNode } from "../types";

import {
  type PreparedLayout,
  applyLayout,
  completeLayoutSynchronously,
  prepareLayout,
} from "./layout";
import { makeFlowNode } from "./test-utils";

type NodeOverrides = {
  fieldCount?: number;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
};

// Layout tests assume non-empty tables by default — without rows, the table
// height collapses and overlap checks lose their signal.
function makeNode(
  id: string,
  overrides: NodeOverrides = {},
): SchemaViewerFlowNode {
  return makeFlowNode({ id, fieldCount: 2, ...overrides });
}

function placedNode(
  id: string,
  position: { x: number; y: number },
  overrides: NodeOverrides = {},
): SchemaViewerFlowNode {
  const node = makeNode(id, { ...overrides, position });
  return { ...node, style: { ...node.style, opacity: 1 } };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function getDagrePreparation(prepared: PreparedLayout) {
  if (prepared.kind !== "dagre") {
    throw new Error(`Expected Dagre preparation, received ${prepared.kind}`);
  }
  return prepared;
}

function getCompletePreparation(prepared: PreparedLayout) {
  if (prepared.kind !== "complete") {
    throw new Error(`Expected complete preparation, received ${prepared.kind}`);
  }
  return prepared;
}

describe("prepareLayout", () => {
  it("prepares fresh layout as Dagre work", () => {
    const nodes = [makeNode("table-1"), makeNode("table-2")];
    const edges = [{ source: "table-1", target: "table-2" }];

    const prepared = prepareLayout({ mode: "fresh", nodes, edges });

    expect(prepared.kind).toBe("dagre");
    const dagre = getDagrePreparation(prepared);
    expect(dagre.graph.nodes.map(({ id }) => id)).toEqual([
      "table-1",
      "table-2",
    ]);
    expect(dagre.graph.edges).toEqual(edges);
  });

  it("completes a connected incremental merge without Dagre", () => {
    const existing = placedNode("table-1", { x: 100, y: 200 });
    const incoming = [existing, makeNode("table-2")];

    const prepared = prepareLayout({
      mode: "merge",
      incoming,
      current: [existing],
      edges: [{ source: "table-1", target: "table-2" }],
    });

    expect(prepared.kind).toBe("complete");
    const complete = getCompletePreparation(prepared);
    expect(complete.result.preservedExistingPositions).toBe(true);
    expect(
      complete.result.nodes.find(({ id }) => id === "table-1")?.position,
    ).toEqual({ x: 100, y: 200 });
  });

  it.each([
    {
      name: "there is no current canvas",
      incoming: [makeNode("table-1")],
      current: [],
      edges: [],
    },
    {
      name: "an existing node was removed",
      incoming: [makeNode("table-1")],
      current: [makeNode("table-1"), makeNode("table-2")],
      edges: [],
    },
    {
      name: "an added node is disconnected",
      incoming: [makeNode("table-1"), makeNode("table-2")],
      current: [makeNode("table-1")],
      edges: [],
    },
  ])(
    "prepares merge as Dagre work when $name",
    ({ incoming, current, edges }) => {
      expect(
        prepareLayout({ mode: "merge", incoming, current, edges }).kind,
      ).toBe("dagre");
    },
  );

  it("completes focus synchronously when every node is in the focal cluster", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const neighbor = makeNode("table-2");

    const prepared = prepareLayout({
      mode: "focus",
      focalId: focal.id,
      nodes: [focal, neighbor],
      edges: [{ source: focal.id, target: neighbor.id }],
    });

    expect(prepared.kind).toBe("complete");
    const complete = getCompletePreparation(prepared);
    expect(
      complete.result.nodes.find(({ id }) => id === focal.id)?.position,
    ).toEqual(focal.position);
  });

  it("sends only the focal side cluster through Dagre", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const neighbor = makeNode("table-2");
    const sideA = makeNode("table-3");
    const sideB = makeNode("table-4");
    const nodes = [sideB, focal, neighbor, sideA];

    const prepared = prepareLayout({
      mode: "focus",
      focalId: focal.id,
      nodes,
      edges: [
        { source: focal.id, target: neighbor.id },
        { source: neighbor.id, target: sideA.id },
        { source: sideA.id, target: sideB.id },
      ],
    });

    expect(prepared.kind).toBe("dagre");
    const dagre = getDagrePreparation(prepared);
    expect(dagre.graph.nodes.map(({ id }) => id)).toEqual([sideB.id, sideA.id]);
    expect(dagre.graph.edges).toEqual([{ source: sideA.id, target: sideB.id }]);

    const result = completeLayoutSynchronously(dagre);
    expect(result.nodes.map(({ id }) => id)).toEqual(nodes.map(({ id }) => id));
    expect(result.nodes.find(({ id }) => id === focal.id)?.position).toEqual(
      focal.position,
    );
    const rects = result.nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      w: node.width!,
      h: node.height!,
    }));
    for (let first = 0; first < rects.length; first++) {
      for (let second = first + 1; second < rects.length; second++) {
        expect(rectsOverlap(rects[first], rects[second])).toBe(false);
      }
    }
  });
});

describe("applyLayout — fresh mode", () => {
  it("positions every node and reports no preserved positions", () => {
    const nodes = [
      makeNode("table-1"),
      makeNode("table-2"),
      makeNode("table-3"),
    ];
    const edges = [
      { source: "table-1", target: "table-2" },
      { source: "table-2", target: "table-3" },
    ];

    const result = applyLayout({ mode: "fresh", nodes, edges });

    expect(result.preservedExistingPositions).toBe(false);
    expect(result.nodes).toHaveLength(3);
    for (const node of result.nodes) {
      expect(node.style?.opacity).toBe(1);
      expect(typeof node.style?.width).toBe("number");
      expect(typeof node.style?.height).toBe("number");
    }
    // All node ids preserved
    expect(result.nodes.map((n) => n.id).sort()).toEqual([
      "table-1",
      "table-2",
      "table-3",
    ]);
  });

  it("produces non-overlapping bounding boxes for connected nodes", () => {
    const nodes = [
      makeNode("table-1"),
      makeNode("table-2"),
      makeNode("table-3"),
    ];
    const edges = [
      { source: "table-1", target: "table-2" },
      { source: "table-2", target: "table-3" },
    ];

    const result = applyLayout({ mode: "fresh", nodes, edges });

    const rects = result.nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: Number(n.style?.width),
      h: Number(n.style?.height),
    }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("handles a single node", () => {
    const result = applyLayout({
      mode: "fresh",
      nodes: [makeNode("table-1")],
      edges: [],
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].style?.opacity).toBe(1);
  });
});

describe("applyLayout — merge mode", () => {
  it("returns fresh layout when there is no existing canvas state", () => {
    const incoming = [makeNode("table-1"), makeNode("table-2")];
    const result = applyLayout({
      mode: "merge",
      incoming,
      current: [],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    expect(result.preservedExistingPositions).toBe(false);
    expect(result.nodes).toHaveLength(2);
    // Fresh path adds opacity:1
    for (const node of result.nodes) {
      expect(node.style?.opacity).toBe(1);
    }
  });

  it("preserves existing positions when only adding a connected node", () => {
    const existing = placedNode("table-1", { x: 100, y: 200 });
    const newNode = makeNode("table-2");
    const result = applyLayout({
      mode: "merge",
      incoming: [existing, newNode],
      current: [existing],
      edges: [{ source: "table-1", target: "table-2" }],
    });

    expect(result.preservedExistingPositions).toBe(true);
    expect(result.nodes).toHaveLength(2);

    const preserved = result.nodes.find((n) => n.id === "table-1")!;
    expect(preserved.position).toEqual({ x: 100, y: 200 });

    const placed = result.nodes.find((n) => n.id === "table-2")!;
    expect(placed.style?.opacity).toBe(1);
  });

  it("places a new node without overlapping the existing neighbor", () => {
    const existing = placedNode("table-1", { x: 0, y: 0 });
    const newNode = makeNode("table-2");
    const result = applyLayout({
      mode: "merge",
      incoming: [existing, newNode],
      current: [existing],
      edges: [{ source: "table-1", target: "table-2" }],
    });

    const a = result.nodes.find((n) => n.id === "table-1")!;
    const b = result.nodes.find((n) => n.id === "table-2")!;
    expect(
      rectsOverlap(
        {
          x: a.position.x,
          y: a.position.y,
          w: Number(a.style?.width),
          h: Number(a.style?.height),
        },
        {
          x: b.position.x,
          y: b.position.y,
          w: Number(b.style?.width),
          h: Number(b.style?.height),
        },
      ),
    ).toBe(false);
  });

  it("places a target-side new node to the right of its source neighbor", () => {
    const existing = placedNode("table-1", { x: 0, y: 0 });
    const newNode = makeNode("table-2");
    const result = applyLayout({
      mode: "merge",
      incoming: [existing, newNode],
      current: [existing],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    const placed = result.nodes.find((n) => n.id === "table-2")!;
    // edge source=existing, new=target → new node prefers the right column.
    expect(placed.position.x).toBeGreaterThan(existing.position.x);
  });

  it("preserves the incoming node order", () => {
    const a = placedNode("table-1", { x: 0, y: 0 });
    const b = placedNode("table-2", { x: 1000, y: 0 });
    const c = makeNode("table-3");
    const incoming = [c, a, b];
    const result = applyLayout({
      mode: "merge",
      incoming,
      current: [a, b],
      edges: [
        { source: "table-1", target: "table-2" },
        { source: "table-1", target: "table-3" },
      ],
    });
    expect(result.nodes.map((n) => n.id)).toEqual([
      "table-3",
      "table-1",
      "table-2",
    ]);
  });

  it("falls back to fresh layout when an existing node was removed", () => {
    const a = placedNode("table-1", { x: 0, y: 0 });
    const b = placedNode("table-2", { x: 1000, y: 0 });
    const result = applyLayout({
      mode: "merge",
      // b dropped from incoming → not a pure add
      incoming: [a],
      current: [a, b],
      edges: [],
    });
    expect(result.preservedExistingPositions).toBe(false);
    expect(result.nodes).toHaveLength(1);
  });

  it("falls back to fresh layout when a new node has no edge to anything existing", () => {
    const existing = placedNode("table-1", { x: 0, y: 0 });
    const orphan = makeNode("table-2");
    const result = applyLayout({
      mode: "merge",
      incoming: [existing, orphan],
      current: [existing],
      edges: [], // orphan has no neighbor
    });
    expect(result.preservedExistingPositions).toBe(false);
  });

  it("returns the no-op preserve result when incoming === current ids", () => {
    const a = placedNode("table-1", { x: 100, y: 200 });
    const b = placedNode("table-2", { x: 600, y: 200 });
    const result = applyLayout({
      mode: "merge",
      incoming: [a, b],
      current: [a, b],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    expect(result.preservedExistingPositions).toBe(true);
    expect(result.nodes.find((n) => n.id === "table-1")?.position).toEqual({
      x: 100,
      y: 200,
    });
    expect(result.nodes.find((n) => n.id === "table-2")?.position).toEqual({
      x: 600,
      y: 200,
    });
  });
});

describe("applyLayout — focus mode", () => {
  it("keeps the focal node at its current position", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const out = makeNode("table-2");
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [focal, out],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    expect(result.nodes.find((n) => n.id === "table-1")?.position).toEqual({
      x: 500,
      y: 500,
    });
  });

  it("places outgoing neighbors to the right of the focal node", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const out1 = makeNode("table-2");
    const out2 = makeNode("table-3");
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [focal, out1, out2],
      edges: [
        { source: "table-1", target: "table-2" },
        { source: "table-1", target: "table-3" },
      ],
    });
    const focalRight = focal.position.x + Number(focal.style?.width);
    for (const id of ["table-2", "table-3"]) {
      const placed = result.nodes.find((n) => n.id === id)!;
      expect(placed.position.x).toBeGreaterThanOrEqual(focalRight);
    }
  });

  it("places incoming neighbors to the left of the focal node", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const inc1 = makeNode("table-2");
    const inc2 = makeNode("table-3");
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [focal, inc1, inc2],
      edges: [
        { source: "table-2", target: "table-1" },
        { source: "table-3", target: "table-1" },
      ],
    });
    for (const id of ["table-2", "table-3"]) {
      const placed = result.nodes.find((n) => n.id === id)!;
      const placedRight = placed.position.x + Number(placed.style?.width);
      expect(placedRight).toBeLessThanOrEqual(focal.position.x);
    }
  });

  it("ignores self-references when partitioning neighbors", () => {
    const focal = placedNode("table-1", { x: 500, y: 500 });
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [focal],
      edges: [{ source: "table-1", target: "table-1" }],
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].position).toEqual({ x: 500, y: 500 });
  });

  it("returns nodes unchanged when the focal node is not in the input", () => {
    const a = placedNode("table-1", { x: 0, y: 0 });
    const b = placedNode("table-2", { x: 1000, y: 0 });
    const result = applyLayout({
      mode: "focus",
      focalId: "table-99",
      nodes: [a, b],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    expect(result.nodes.find((n) => n.id === "table-1")?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(result.nodes.find((n) => n.id === "table-2")?.position).toEqual({
      x: 1000,
      y: 0,
    });
  });

  it("places disconnected nodes without overlapping the focal cluster", () => {
    const focal = placedNode("table-1", { x: 0, y: 0 });
    const out = makeNode("table-2");
    const orphan = makeNode("table-3");
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [focal, out, orphan],
      edges: [{ source: "table-1", target: "table-2" }],
    });
    const rects = result.nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: Number(n.style?.width),
      h: Number(n.style?.height),
    }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("preserves the original node order in the result", () => {
    const focal = placedNode("table-1", { x: 0, y: 0 });
    const a = makeNode("table-2");
    const b = makeNode("table-3");
    const result = applyLayout({
      mode: "focus",
      focalId: "table-1",
      nodes: [a, focal, b],
      edges: [
        { source: "table-1", target: "table-2" },
        { source: "table-1", target: "table-3" },
      ],
    });
    expect(result.nodes.map((n) => n.id)).toEqual([
      "table-2",
      "table-1",
      "table-3",
    ]);
  });
});
