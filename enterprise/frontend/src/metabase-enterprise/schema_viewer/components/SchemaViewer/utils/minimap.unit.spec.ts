import type { SchemaViewerFlowEdge } from "../types";

import {
  type MinimapDrawContext,
  drawMinimapNodes,
  getConnectionShading,
  getMinimapTransform,
  getViewportIndicator,
  minimapToWorld,
} from "./minimap";
import { makeFlowNode } from "./test-utils";

// Graph spans x 0..1000, y 0..500. The minimap is 200x100 inside 8px padding,
// so the graph fits at scale 0.2 and every projected point shifts by 8px.
const BOUNDS = { x: 0, y: 0, width: 1000, height: 500 };
const MINIMAP_SIZE = { width: 216, height: 116 };

describe("getMinimapTransform", () => {
  it("fits and centers the graph bounds inside the padded minimap", () => {
    const tallBounds = { x: -100, y: 0, width: 500, height: 500 };

    // Height limits the scale (100 / 500); the 100px-wide result is centered
    // in the 216px width.
    expect(getMinimapTransform(tallBounds, MINIMAP_SIZE)).toEqual({
      bounds: tallBounds,
      scale: 0.2,
      offsetX: 58,
      offsetY: 8,
    });
  });

  it("returns null for empty bounds", () => {
    expect(
      getMinimapTransform({ x: 0, y: 0, width: 0, height: 0 }, MINIMAP_SIZE),
    ).toBeNull();
  });
});

describe("minimapToWorld", () => {
  it("maps a minimap pixel back to graph coordinates", () => {
    const transform = getMinimapTransform(BOUNDS, MINIMAP_SIZE);

    expect(transform && minimapToWorld(transform, { x: 108, y: 58 })).toEqual({
      x: 500,
      y: 250,
    });
  });
});

describe("getViewportIndicator", () => {
  it("projects the visible canvas area into minimap pixels", () => {
    const transform = getMinimapTransform(BOUNDS, MINIMAP_SIZE);

    // Canvas 800x400 at zoom 2 shows world x 100..500, y 50..250.
    expect(
      transform &&
        getViewportIndicator(
          transform,
          { x: -200, y: -100, zoom: 2 },
          { width: 800, height: 400 },
        ),
    ).toEqual({ x: 28, y: 18, width: 80, height: 40 });
  });

  it("keeps a tiny viewport visible at a minimum size around the same center", () => {
    const transform = getMinimapTransform(BOUNDS, MINIMAP_SIZE);

    // At zoom 5 a 100x50 canvas projects to a 4x2px box at (108, 58); with an
    // 8px minimum it grows around its center (110, 59).
    expect(
      transform &&
        getViewportIndicator(
          transform,
          { x: -2500, y: -1250, zoom: 5 },
          { width: 100, height: 50 },
          8,
        ),
    ).toEqual({ x: 106, y: 55, width: 8, height: 8 });
  });
});

describe("drawMinimapNodes", () => {
  it("draws every logical node at its projected position", () => {
    const fillRects: number[][] = [];
    const fillStyles: string[] = [];
    const context: MinimapDrawContext = {
      fillStyle: "",
      clearRect: jest.fn(),
      fillRect(x, y, width, height) {
        fillRects.push([x, y, width, height]);
        fillStyles.push(String(this.fillStyle));
      },
    };
    const nodes = [
      makeFlowNode({
        id: 1,
        position: { x: 0, y: 0 },
        width: 500,
        height: 100,
      }),
      makeFlowNode({
        id: 2,
        position: { x: 500, y: 250 },
        width: 500,
        height: 250,
      }),
    ];
    const transform = getMinimapTransform(BOUNDS, MINIMAP_SIZE);

    if (transform == null) {
      throw new Error("expected a transform");
    }
    drawMinimapNodes(context, nodes, transform, MINIMAP_SIZE, (node) =>
      node.id === "table-1" ? "red" : "blue",
    );

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 216, 116);
    expect(fillRects).toEqual([
      [8, 8, 100, 20],
      [108, 58, 100, 50],
    ]);
    expect(fillStyles).toEqual(["red", "blue"]);
  });
});

describe("getConnectionShading", () => {
  function makeEdge(source: string, target: string): SchemaViewerFlowEdge {
    return {
      id: `${source}->${target}`,
      source,
      target,
      type: "schemaViewerEdge",
      data: { relationship: "many-to-one" },
    };
  }

  // hub has 2 connections (the max), mid has 1, leaf has none.
  const HUB = makeFlowNode({ id: 1 });
  const MID = makeFlowNode({ id: 2 });
  const LEAF = makeFlowNode({ id: 3 });
  const EDGES = [
    makeEdge("table-1", "table-2"),
    makeEdge("table-1", "table-1"),
  ];

  it("shades hubs darker than leaves in the light palette", () => {
    const { getColor } = getConnectionShading(
      [makeEdge("table-1", "table-2"), makeEdge("table-1", "table-4")],
      false,
    );

    expect(getColor(HUB)).toBe("hsl(0, 0%, 32%)");
    expect(getColor(MID)).toBe("hsl(0, 0%, 60%)");
    expect(getColor(LEAF)).toBe("hsl(0, 0%, 88%)");
  });

  it("shades hubs lighter than leaves in the dark palette", () => {
    const { getColor } = getConnectionShading(EDGES, true);

    expect(getColor(HUB)).toBe("hsl(0, 0%, 80%)");
    expect(getColor(LEAF)).toBe("hsl(0, 0%, 28%)");
  });

  it("orders nodes so the most connected are drawn last", () => {
    const { orderForDrawing } = getConnectionShading(EDGES, false);

    expect(orderForDrawing([HUB, LEAF, MID]).map((node) => node.id)).toEqual([
      "table-3",
      "table-2",
      "table-1",
    ]);
  });
});
