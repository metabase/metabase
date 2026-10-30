import { act, renderHook } from "@testing-library/react";

import { makeFlowNode } from "../utils/test-utils";

import {
  createSchemaViewerDetailsStore,
  useSchemaViewerDetails,
} from "./useSchemaViewerDetails";

const VIEWPORT_SIZE = { width: 1000, height: 500 };
const ORIGIN_VIEWPORT = { x: 0, y: 0, zoom: 1 };

function ids(values: ReadonlySet<string>) {
  return [...values].sort();
}

describe("createSchemaViewerDetailsStore", () => {
  it("notifies only nodes whose detail level changed", () => {
    const store = createSchemaViewerDetailsStore();
    const firstListener = jest.fn();
    const secondListener = jest.fn();
    store.subscribe("table-1", firstListener);
    store.subscribe("table-2", secondListener);

    store.setDetailedNodeIds(new Set(["table-1"]));
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();

    store.setDetailedNodeIds(new Set(["table-1"]));
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();

    store.setDetailedNodeIds(new Set(["table-2"]));
    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledTimes(1);
  });
});

describe("useSchemaViewerDetails", () => {
  it("includes nodes in the one-viewport overscan region", () => {
    const nodes = [
      makeFlowNode({ id: 1, position: { x: -900, y: 0 } }),
      makeFlowNode({ id: 2, position: { x: 1900, y: 0 } }),
      makeFlowNode({ id: 3, position: { x: 2100, y: 0 } }),
    ];
    const { result } = renderHook(() =>
      useSchemaViewerDetails({ nodes, forcedNodeIds: new Set() }),
    );

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1", "table-2"]);
  });

  it("details visible nodes at maximum zoom-out too", () => {
    const node = makeFlowNode({ id: 1, position: { x: 0, y: 0 } });
    const { result } = renderHook(() =>
      useSchemaViewerDetails({ nodes: [node], forcedNodeIds: new Set() }),
    );

    act(() =>
      result.current.settleViewport(
        { ...ORIGIN_VIEWPORT, zoom: 0.3 },
        VIEWPORT_SIZE,
      ),
    );
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);
  });

  it("retains the settled set during movement and replaces it at move end", () => {
    const nodes = [
      makeFlowNode({ id: 1, position: { x: 0, y: 0 } }),
      makeFlowNode({ id: 2, position: { x: 3000, y: 0 } }),
    ];
    const { result } = renderHook(() =>
      useSchemaViewerDetails({ nodes, forcedNodeIds: new Set() }),
    );

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);

    // No live viewport subscription: movement alone cannot change the set.
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);

    act(() =>
      result.current.settleViewport({ x: -3000, y: 0, zoom: 1 }, VIEWPORT_SIZE),
    );
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-2"]);
  });

  it("recomputes moved nodes against the last settled viewport only on request", () => {
    const initialNodes = [
      makeFlowNode({ id: 1, position: { x: 0, y: 0 } }),
      makeFlowNode({ id: 2, position: { x: 3000, y: 0 } }),
    ];
    const { result, rerender } = renderHook(
      ({ nodes }) =>
        useSchemaViewerDetails({ nodes, forcedNodeIds: new Set() }),
      { initialProps: { nodes: initialNodes } },
    );

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);

    rerender({
      nodes: [
        makeFlowNode({ id: 1, position: { x: 3000, y: 0 } }),
        makeFlowNode({ id: 2, position: { x: 0, y: 0 } }),
      ],
    });
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);

    act(() => result.current.recomputeDetails());
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-2"]);
  });

  it("keeps selected and explicitly focused nodes detailed", () => {
    // Both nodes are outside the window, which spans x -1000..2000.
    const nodes = [
      makeFlowNode({ id: 1, position: { x: 5000, y: 0 } }),
      makeFlowNode({ id: 2, position: { x: 6000, y: 0 } }),
    ];
    const { result } = renderHook(() =>
      useSchemaViewerDetails({
        nodes,
        forcedNodeIds: new Set(["table-1"]),
      }),
    );

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1"]);

    act(() => result.current.focusNode("table-2"));
    expect(ids(result.current.detailedNodeIds)).toEqual(["table-1", "table-2"]);
  });

  it("reports whether a viewport is inside the detailed window", () => {
    const { result } = renderHook(() =>
      useSchemaViewerDetails({ nodes: [], forcedNodeIds: new Set() }),
    );
    expect(
      result.current.isViewportDetailed(ORIGIN_VIEWPORT, VIEWPORT_SIZE),
    ).toBe(false);

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, VIEWPORT_SIZE));
    // One overscan viewport (1000px) on each side.
    expect(
      result.current.isViewportDetailed(
        { x: -1000, y: 0, zoom: 1 },
        VIEWPORT_SIZE,
      ),
    ).toBe(true);
    expect(
      result.current.isViewportDetailed(
        { x: -1001, y: 0, zoom: 1 },
        VIEWPORT_SIZE,
      ),
    ).toBe(false);

    // Maximum zoom-out needs details too: at zoom 0.3 the visible area is
    // 3333px wide, so the window spans x -3333..6667.
    const zoomedOut = { x: 0, y: 0, zoom: 0.3 };
    act(() => result.current.settleViewport(zoomedOut, VIEWPORT_SIZE));
    expect(
      result.current.isViewportDetailed(
        { ...zoomedOut, x: -1000 },
        VIEWPORT_SIZE,
      ),
    ).toBe(true);
    expect(
      result.current.isViewportDetailed(
        { ...zoomedOut, x: -1001 },
        VIEWPORT_SIZE,
      ),
    ).toBe(false);
  });

  it.each([
    { width: 0, height: 500 },
    { width: 1000, height: 0 },
    { width: Number.NaN, height: 500 },
  ])("returns no accidental details for invalid size %#", (size) => {
    const node = makeFlowNode({ id: 1, position: { x: 0, y: 0 } });
    const { result } = renderHook(() =>
      useSchemaViewerDetails({ nodes: [node], forcedNodeIds: new Set() }),
    );

    act(() => result.current.settleViewport(ORIGIN_VIEWPORT, size));
    expect(ids(result.current.detailedNodeIds)).toEqual([]);
  });
});
