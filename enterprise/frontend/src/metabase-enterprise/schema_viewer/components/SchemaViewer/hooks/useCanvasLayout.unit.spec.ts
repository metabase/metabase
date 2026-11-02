import { act, renderHook, waitFor } from "@testing-library/react";

import type { SchemaViewerFlowEdge } from "../types";
import { makeFlowNode } from "../utils/test-utils";

import { useCanvasLayout } from "./useCanvasLayout";
import type { GraphLayoutMethods, LayoutOutcome } from "./useGraphLayout";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeGraphLayout(
  requestLayout: GraphLayoutMethods["requestLayout"],
): GraphLayoutMethods {
  return {
    requestLayout,
    cancelLayout: jest.fn(),
    pendingReason: null,
    layoutError: null,
    clearLayoutError: jest.fn(),
  };
}

function setup(outcome: Promise<LayoutOutcome>) {
  const node = makeFlowNode({ id: 1, fieldCount: 2 });
  const targetNode = makeFlowNode({ id: 2, fieldCount: 2 });
  const laidOutNode = {
    ...node,
    position: { x: 100, y: 200 },
    selected: true,
    style: { ...node.style, opacity: 1 },
  };
  const laidOutTarget = {
    ...targetNode,
    position: { x: 600, y: 200 },
    style: { ...targetNode.style, opacity: 1 },
  };
  const edge: SchemaViewerFlowEdge = {
    id: "edge-11-21",
    source: "table-1",
    target: "table-2",
    selected: true,
    data: { relationship: "many-to-one" },
  };
  const requestLayout = jest.fn().mockReturnValue(outcome);
  const setNodes = jest.fn();
  const setEdges = jest.fn();
  const zoomToNode = jest.fn();
  const zoomToCanvas = jest.fn();
  const graphLayout = makeGraphLayout(requestLayout);

  const utils = renderHook(() =>
    useCanvasLayout({
      nodes: [node, targetNode],
      edges: [edge],
      setNodes,
      setEdges,
      zoomToNode,
      zoomToCanvas,
      graphLayout,
    }),
  );

  return {
    ...utils,
    node,
    targetNode,
    laidOutNode,
    laidOutTarget,
    edge,
    requestLayout,
    setNodes,
    setEdges,
    zoomToNode,
    zoomToCanvas,
  };
}

describe("useCanvasLayout", () => {
  it("commits and fits a successful auto-layout", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);

    act(() => utils.result.current.resetLayout());

    expect(utils.requestLayout).toHaveBeenCalledWith(
      {
        mode: "fresh",
        nodes: [utils.node, utils.targetNode],
        edges: [utils.edge],
      },
      "auto-layout",
    );
    expect(utils.setNodes).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({
        status: "success",
        result: {
          nodes: [utils.laidOutNode, utils.laidOutTarget],
          preservedExistingPositions: false,
        },
      });
      await deferred.promise;
    });

    expect(utils.setNodes).toHaveBeenCalledTimes(1);
    const updateNodes = utils.setNodes.mock.calls[0][0];
    expect(updateNodes([utils.node, utils.targetNode])).toEqual([
      {
        ...utils.node,
        position: utils.laidOutNode.position,
        style: utils.laidOutNode.style,
      },
      {
        ...utils.targetNode,
        position: utils.laidOutTarget.position,
        style: utils.laidOutTarget.style,
      },
    ]);
    expect(utils.zoomToCanvas).toHaveBeenCalledTimes(1);
  });

  it("preserves interaction state changed while auto-layout is pending", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);

    act(() => utils.result.current.resetLayout());

    await act(async () => {
      deferred.resolve({
        status: "success",
        result: {
          nodes: [utils.laidOutNode, utils.laidOutTarget],
          preservedExistingPositions: false,
        },
      });
      await deferred.promise;
    });

    const updateNodes = utils.setNodes.mock.calls[0][0];
    const latestNode = {
      ...utils.node,
      data: {
        ...utils.node.data,
        selectedFieldIds: new Set([1]),
      },
    };
    const result = updateNodes([latestNode, utils.targetNode]);

    expect(result[0].position).toEqual(utils.laidOutNode.position);
    expect(result[0].style).toEqual(utils.laidOutNode.style);
    expect(result[0].data).toBe(latestNode.data);
    expect(result[0].selected).toBe(latestNode.selected);
  });

  it("does not restore interaction state cleared while auto-layout is pending", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);
    const staleLaidOutNode = {
      ...utils.laidOutNode,
      data: {
        ...utils.laidOutNode.data,
        selectedFieldIds: new Set([1]),
      },
    };

    act(() => utils.result.current.resetLayout());

    await act(async () => {
      deferred.resolve({
        status: "success",
        result: {
          nodes: [staleLaidOutNode, utils.laidOutTarget],
          preservedExistingPositions: false,
        },
      });
      await deferred.promise;
    });

    const updateNodes = utils.setNodes.mock.calls[0][0];
    const result = updateNodes([utils.node, utils.targetNode]);

    expect(result[0].position).toEqual(staleLaidOutNode.position);
    expect(result[0].data).toBe(utils.node.data);
    expect(result[0].data.selectedFieldIds).toEqual(new Set());
  });

  it("commits a successful focus layout and clears selection", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);

    act(() => utils.result.current.focusOnNode("table-1"));

    expect(utils.requestLayout).toHaveBeenCalledWith(
      {
        mode: "focus",
        focalId: "table-1",
        nodes: [utils.node, utils.targetNode],
        edges: [utils.edge],
      },
      "focus-node",
    );

    await act(async () => {
      deferred.resolve({
        status: "success",
        result: {
          nodes: [utils.laidOutNode, utils.laidOutTarget],
          preservedExistingPositions: false,
        },
      });
      await deferred.promise;
    });

    expect(utils.setNodes).toHaveBeenCalledTimes(1);
    const updateNodes = utils.setNodes.mock.calls[0][0];
    expect(updateNodes([utils.node, utils.targetNode])).toEqual([
      {
        ...utils.node,
        position: utils.laidOutNode.position,
        style: utils.laidOutNode.style,
        selected: false,
      },
      {
        ...utils.targetNode,
        position: utils.laidOutTarget.position,
        style: utils.laidOutTarget.style,
        selected: false,
      },
    ]);
    expect(utils.setEdges).toHaveBeenCalled();
    const updateEdges = utils.setEdges.mock.calls[0][0];
    expect(updateEdges([utils.edge])).toEqual([
      { ...utils.edge, selected: false },
    ]);
    expect(utils.zoomToNode).toHaveBeenCalledWith("table-1");
  });

  it.each<LayoutOutcome>([
    { status: "cancelled" },
    { status: "error", error: new Error("layout failed") },
  ])("preserves the canvas for a $status auto-layout", async (outcome) => {
    const utils = setup(Promise.resolve(outcome));

    act(() => utils.result.current.resetLayout());
    await waitFor(() => expect(utils.requestLayout).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());

    expect(utils.setNodes).not.toHaveBeenCalled();
    expect(utils.setEdges).not.toHaveBeenCalled();
    expect(utils.zoomToCanvas).not.toHaveBeenCalled();
  });
});

describe("useCanvasLayout action identity", () => {
  it("keeps stable actions across node updates while laying out the latest nodes", () => {
    const requestLayout = jest
      .fn()
      .mockReturnValue(new Promise<LayoutOutcome>(() => {}));
    const graphLayout = makeGraphLayout(requestLayout);
    const callbacks = {
      setNodes: jest.fn(),
      setEdges: jest.fn(),
      zoomToNode: jest.fn(),
      zoomToCanvas: jest.fn(),
    };
    const before = [makeFlowNode({ id: 1, position: { x: 0, y: 0 } })];
    const { result, rerender } = renderHook(
      ({ nodes }) =>
        useCanvasLayout({ nodes, edges: [], graphLayout, ...callbacks }),
      { initialProps: { nodes: before } },
    );
    const { resetLayout, focusOnNode } = result.current;

    // A table drag produces a new nodes array every frame.
    const dragged = [makeFlowNode({ id: 1, position: { x: 90, y: 40 } })];
    rerender({ nodes: dragged });

    expect(result.current.resetLayout).toBe(resetLayout);
    expect(result.current.focusOnNode).toBe(focusOnNode);
    act(() => result.current.resetLayout());
    expect(requestLayout).toHaveBeenCalledWith(
      { mode: "fresh", nodes: dragged, edges: [] },
      "auto-layout",
    );
  });
});
