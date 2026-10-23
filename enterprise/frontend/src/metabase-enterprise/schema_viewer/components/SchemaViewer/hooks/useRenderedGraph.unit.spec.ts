import { act, renderHook } from "@testing-library/react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { makeFlowNode } from "../utils/test-utils";

import { useRenderedGraph } from "./useRenderedGraph";

const VIEWPORT_SIZE = { width: 1000, height: 500 };
const ORIGIN_VIEWPORT = { x: 0, y: 0, zoom: 1 };
const NO_FORCED_IDS = new Set<string>();

function makeEdge(source: string, target: string): SchemaViewerFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: "schemaViewerEdge",
    data: { relationship: "many-to-one" },
  };
}

function ids(items: readonly { id: string }[]) {
  return items.map((item) => item.id).sort();
}

const NEAR = makeFlowNode({ id: 1, position: { x: 0, y: 0 } });
const FAR = makeFlowNode({ id: 2, position: { x: 10_000, y: 0 } });
const ISOLATED = makeFlowNode({ id: 3, position: { x: 20_000, y: 0 } });
const NEAR_TO_FAR = makeEdge("table-1", "table-2");

type Props = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  forcedNodeIds: ReadonlySet<string>;
};

function setup(initialProps: Partial<Props> = {}) {
  return renderHook((props: Props) => useRenderedGraph(props), {
    initialProps: {
      nodes: [NEAR, FAR, ISOLATED],
      edges: [NEAR_TO_FAR],
      forcedNodeIds: NO_FORCED_IDS,
      ...initialProps,
    },
  });
}

describe("useRenderedGraph", () => {
  it("renders nothing before the first settle or camera move", () => {
    const { result } = setup();

    expect(result.current.renderedNodes).toEqual([]);
    expect(result.current.renderedEdges).toEqual([]);
  });

  it("scales overscan with zoom so low zoom does not mount most of the graph", () => {
    // A is 1.2 viewports right of a zoom-1 view; B is 1.2 viewports right of
    // a zoom-0.3 view (viewport 3333px wide), where A is on screen.
    const A = makeFlowNode({ id: 4, position: { x: 2200, y: 0 } });
    const B = makeFlowNode({ id: 5, position: { x: 7333, y: 0 } });
    const { result } = setup({ nodes: [NEAR, A, B], edges: [] });

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.renderedNodes)).toEqual(["table-1", "table-4"]);

    act(() =>
      result.current.settleViewport({ x: 0, y: 0, zoom: 0.3 }, VIEWPORT_SIZE),
    );
    expect(ids(result.current.renderedNodes)).toEqual(["table-1", "table-4"]);
  });

  it("renders only window nodes, plus every edge touching them", () => {
    const { result } = setup();

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));

    expect(ids(result.current.renderedNodes)).toEqual(["table-1"]);
    expect(result.current.renderedEdges).toEqual([NEAR_TO_FAR]);
  });

  it("keeps membership fixed when nodes move until recomputed", () => {
    const { result, rerender } = setup();
    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));

    const movedIsolated = { ...ISOLATED, position: { x: 100, y: 0 } };
    rerender({
      nodes: [NEAR, FAR, movedIsolated],
      edges: [NEAR_TO_FAR],
      forcedNodeIds: NO_FORCED_IDS,
    });
    expect(ids(result.current.renderedNodes)).toEqual(["table-1"]);

    act(() => result.current.recomputeWindow());
    expect(ids(result.current.renderedNodes)).toEqual(["table-1", "table-3"]);
  });

  it("always renders forced nodes", () => {
    const { result } = setup({ forcedNodeIds: new Set(["table-3"]) });

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));

    expect(ids(result.current.renderedNodes)).toEqual(["table-1", "table-3"]);
  });

  it("adds a camera destination to the window and releases it at the next settle", () => {
    const { result } = setup();
    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));

    act(() =>
      result.current.includeViewport(
        { x: -20_000, y: 0, zoom: 1 },
        VIEWPORT_SIZE,
      ),
    );
    expect(ids(result.current.renderedNodes)).toEqual(["table-1", "table-3"]);

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.renderedNodes)).toEqual(["table-1"]);
  });

  it("reports whether a viewport is inside the rendered window", () => {
    const { result } = setup();
    expect(
      result.current.isViewportRendered(ORIGIN_VIEWPORT, VIEWPORT_SIZE),
    ).toBe(false);

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));

    // Zoom 1 renders 2 overscan viewports (2000px) on each side.
    expect(
      result.current.isViewportRendered(
        { x: -2000, y: 0, zoom: 1 },
        VIEWPORT_SIZE,
      ),
    ).toBe(true);
    expect(
      result.current.isViewportRendered(
        { x: -2001, y: 0, zoom: 1 },
        VIEWPORT_SIZE,
      ),
    ).toBe(false);
  });

  it("returns stable arrays when a settle does not change membership", () => {
    const { result } = setup();
    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    const { renderedNodes } = result.current;

    act(() =>
      result.current.settleViewport({ x: -10, y: 0, zoom: 1 }, VIEWPORT_SIZE),
    );

    expect(result.current.renderedNodes).toBe(renderedNodes);
  });
});
