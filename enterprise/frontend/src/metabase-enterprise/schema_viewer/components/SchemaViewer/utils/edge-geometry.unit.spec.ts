import { Position } from "@xyflow/react";

import type {
  SchemaViewerFlowEdge,
  SchemaViewerFlowNode,
  SchemaViewerNodeHandle,
} from "../types";

import { findEdgeAtPoint, getEdgeGeometry } from "./edge-geometry";
import { makeFlowNode } from "./test-utils";

// Handle geometry as `toFlowGraph` produces it: 1px handles centered on the
// card edge, at the middle of the field's 48px row below a 56px header.
const SOURCE_HANDLE: SchemaViewerNodeHandle = {
  id: "field-11",
  type: "source",
  position: Position.Right,
  x: 319.5,
  y: 79.5,
  width: 1,
  height: 1,
};
const TARGET_HANDLE: SchemaViewerNodeHandle = {
  id: "field-21",
  type: "target",
  position: Position.Left,
  x: -0.5,
  y: 127.5,
  width: 1,
  height: 1,
};
const SELF_TARGET_HANDLE: SchemaViewerNodeHandle = {
  ...TARGET_HANDLE,
  id: "field-12-right",
  position: Position.Right,
  x: 319.5,
};

function withHandles(
  node: SchemaViewerFlowNode,
  handles: SchemaViewerNodeHandle[],
): SchemaViewerFlowNode {
  return { ...node, data: { ...node.data, handles } };
}

const SOURCE_NODE = withHandles(
  makeFlowNode({ id: 1, position: { x: 100, y: 200 } }),
  [SOURCE_HANDLE, SELF_TARGET_HANDLE],
);
const TARGET_NODE = withHandles(
  makeFlowNode({ id: 2, position: { x: 600, y: 50 } }),
  [TARGET_HANDLE],
);
const NODES_BY_ID = new Map([
  [SOURCE_NODE.id, SOURCE_NODE],
  [TARGET_NODE.id, TARGET_NODE],
]);

function makeEdge(
  overrides: Partial<SchemaViewerFlowEdge> = {},
): SchemaViewerFlowEdge {
  return {
    id: "edge-11-21",
    source: "table-1",
    target: "table-2",
    sourceHandle: "field-11",
    targetHandle: "field-21",
    data: { relationship: "many-to-one" },
    ...overrides,
  };
}

describe("getEdgeGeometry", () => {
  it("connects the source and target handles of the logical nodes", () => {
    const geometry = getEdgeGeometry(makeEdge(), NODES_BY_ID);

    // Source anchor: (100 + 319.5 + 1, 200 + 79.5 + 0.5); target anchor:
    // (600 - 0.5, 50 + 127.5 + 0.5).
    expect(geometry?.path.startsWith("M420.5 280")).toBe(true);
    expect(geometry?.path.endsWith("L599.5 178")).toBe(true);
  });

  it("draws a crow's foot at the source and a bar at the target of a many-to-one edge", () => {
    const geometry = getEdgeGeometry(makeEdge(), NODES_BY_ID);

    expect(geometry?.symbolPath).toBe(
      "M432.5 280L424.5 274M432.5 280L424.5 286M595.5 172L595.5 184",
    );
  });

  it("draws bars at both ends of a one-to-one edge", () => {
    const geometry = getEdgeGeometry(
      makeEdge({ data: { relationship: "one-to-one" } }),
      NODES_BY_ID,
    );

    expect(geometry?.symbolPath).toBe(
      "M424.5 274L424.5 286M595.5 172L595.5 184",
    );
  });

  it("loops a self-reference around the right side of its table", () => {
    const geometry = getEdgeGeometry(
      makeEdge({ target: "table-1", targetHandle: "field-12-right" }),
      NODES_BY_ID,
    );

    // Both anchors are on the right edge (x = 420.5): source at y 280, target
    // at y 328; the loop turns 50px to the right with 8px rounded corners.
    expect(geometry?.path).toBe(
      "M 420.5 280 L 462.5 280 Q 470.5 280 470.5 288 L 470.5 320 Q 470.5 328 462.5 328 L 420.5 328",
    );
  });

  it("returns null when an endpoint node or handle is missing", () => {
    expect(
      getEdgeGeometry(makeEdge({ target: "table-9" }), NODES_BY_ID),
    ).toBeNull();
    expect(
      getEdgeGeometry(makeEdge({ targetHandle: "field-99" }), NODES_BY_ID),
    ).toBeNull();
  });
});

describe("findEdgeAtPoint", () => {
  const geometry = getEdgeGeometry(makeEdge(), NODES_BY_ID);
  const geometries = geometry == null ? [] : [geometry];

  it("finds an edge within the tolerance of its path", () => {
    // The smooth-step path leaves the source horizontally along y = 280.
    expect(findEdgeAtPoint(geometries, { x: 430, y: 284 }, 5)).toBe(
      "edge-11-21",
    );
  });

  it("returns null outside the tolerance", () => {
    expect(findEdgeAtPoint(geometries, { x: 430, y: 290 }, 5)).toBeNull();
  });

  it("returns the nearest of several edges", () => {
    const near = { ...geometries[0], id: "near" };
    const far = {
      ...geometries[0],
      id: "far",
      points: geometries[0].points.map((point) => ({
        x: point.x,
        y: point.y + 4,
      })),
    };

    expect(findEdgeAtPoint([far, near], { x: 430, y: 281 }, 10)).toBe("near");
  });
});
