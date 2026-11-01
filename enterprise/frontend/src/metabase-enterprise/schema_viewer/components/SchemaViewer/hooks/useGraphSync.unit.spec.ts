import { act, renderHook, waitFor } from "@testing-library/react";

import type { ConcreteTableId } from "metabase-types/api";

import type { SchemaViewerFlowEdge } from "../types";
import { makeFlowNode } from "../utils/test-utils";

import type { GraphLayoutMethods, LayoutOutcome } from "./useGraphLayout";
import { useGraphSync } from "./useGraphSync";

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

function makeEdge(): SchemaViewerFlowEdge {
  return {
    id: "edge-11-21",
    source: "table-1",
    target: "table-2",
    sourceHandle: "field-11",
    targetHandle: "field-21",
    type: "schemaViewerEdge",
    data: { relationship: "many-to-one" },
  };
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
  const incomingNode = makeFlowNode({ id: 1, fieldCount: 2 });
  const incomingTarget = makeFlowNode({ id: 2, fieldCount: 2 });
  const laidOutNode = {
    ...incomingNode,
    position: { x: 100, y: 200 },
    style: { ...incomingNode.style, opacity: 1 },
  };
  const laidOutTarget = {
    ...incomingTarget,
    position: { x: 600, y: 200 },
    style: { ...incomingTarget.style, opacity: 1 },
  };
  const edge = makeEdge();
  const requestLayout = jest.fn().mockReturnValue(outcome);
  const graphLayout = makeGraphLayout(requestLayout);
  const setNodes = jest.fn();
  const setEdges = jest.fn();
  const setExpandingTableIds = jest.fn();
  const zoomToNode = jest.fn();
  const zoomToCanvas = jest.fn();

  const initialProps: {
    contextKey: `1__${string}` | `2__${string}`;
  } = { contextKey: "1__public" };
  const utils = renderHook(
    ({ contextKey }) =>
      useGraphSync({
        hasDbSelected: true,
        error: null,
        isFetching: false,
        graph: { nodes: [incomingNode, incomingTarget], edges: [edge] },
        nodes: [],
        contextKey,
        setNodes,
        setEdges,
        setExpandingTableIds,
        zoomToNode,
        zoomToCanvas,
        graphLayout,
      }),
    { initialProps },
  );

  return {
    ...utils,
    incomingNode,
    incomingTarget,
    laidOutNode,
    laidOutTarget,
    edge,
    graphLayout,
    requestLayout,
    setNodes,
    setEdges,
    setExpandingTableIds,
    zoomToNode,
    zoomToCanvas,
  };
}

describe("useGraphSync", () => {
  it("commits matching nodes and edges only after current layout succeeds", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);

    await waitFor(() => expect(utils.requestLayout).toHaveBeenCalledTimes(1));
    expect(utils.requestLayout).toHaveBeenCalledWith(
      {
        mode: "merge",
        incoming: [utils.incomingNode, utils.incomingTarget],
        current: [],
        edges: [utils.edge],
      },
      "graph-sync",
    );
    expect(utils.setNodes).not.toHaveBeenCalled();
    expect(utils.setEdges).not.toHaveBeenCalled();

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

    expect(utils.setNodes).toHaveBeenCalledWith([
      utils.laidOutNode,
      utils.laidOutTarget,
    ]);
    expect(utils.setEdges).toHaveBeenCalledWith([utils.edge]);
    expect(utils.zoomToCanvas).toHaveBeenCalledTimes(1);
  });

  it.each<LayoutOutcome>([
    { status: "cancelled" },
    { status: "error", error: new Error("layout failed") },
  ])("does not commit a $status layout outcome", async (outcome) => {
    const utils = setup(Promise.resolve(outcome));

    await waitFor(() => expect(utils.requestLayout).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());

    expect(utils.setNodes).not.toHaveBeenCalled();
    expect(utils.setEdges).not.toHaveBeenCalled();
    expect(utils.zoomToCanvas).not.toHaveBeenCalled();
  });

  it("cancels layout before clearing state on context change", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);
    await waitFor(() => expect(utils.requestLayout).toHaveBeenCalledTimes(1));
    jest.clearAllMocks();

    utils.rerender({ contextKey: "2__public" });

    expect(utils.graphLayout.cancelLayout).toHaveBeenCalledTimes(1);
    expect(utils.setNodes).toHaveBeenCalledWith([]);
    expect(utils.setEdges).toHaveBeenCalledWith([]);
    expect(
      jest.mocked(utils.graphLayout.cancelLayout).mock.invocationCallOrder[0],
    ).toBeLessThan(utils.setNodes.mock.invocationCallOrder[0]);
    expect(
      jest.mocked(utils.graphLayout.cancelLayout).mock.invocationCallOrder[0],
    ).toBeLessThan(utils.setEdges.mock.invocationCallOrder[0]);
  });

  it("clears expansion markers only after a successful graph commit", async () => {
    const deferred = createDeferred<LayoutOutcome>();
    const utils = setup(deferred.promise);
    await waitFor(() => expect(utils.requestLayout).toHaveBeenCalledTimes(1));

    await act(async () => {
      deferred.resolve({
        status: "success",
        result: {
          nodes: [utils.laidOutNode, utils.laidOutTarget],
          preservedExistingPositions: true,
        },
      });
      await deferred.promise;
    });

    const update = utils.setExpandingTableIds.mock.calls.at(-1)?.[0];
    const pending = new Set<ConcreteTableId>([1, 3]);
    expect(update(pending)).toEqual(new Set([3]));
  });
});
