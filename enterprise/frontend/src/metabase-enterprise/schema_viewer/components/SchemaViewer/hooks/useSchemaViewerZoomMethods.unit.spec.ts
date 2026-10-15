import { act, renderHook } from "@testing-library/react";
import type { Viewport } from "@xyflow/react";

import type { SchemaViewerFlowNode } from "../types";
import { makeFlowNode } from "../utils/test-utils";

import { useSchemaViewerZoomMethods } from "./useSchemaViewerZoomMethods";

const CANVAS_SIZE = { width: 1000, height: 500 };

const RENDERED = makeFlowNode({ id: 1, position: { x: 0, y: 0 } });
const UNRENDERED = makeFlowNode({ id: 2, position: { x: 2000, y: 800 } });

function setup(nodes: SchemaViewerFlowNode[]) {
  const canvas = document.createElement("div");
  canvas.className = "react-flow";
  jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    ...CANVAS_SIZE,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: CANVAS_SIZE.width,
    bottom: CANVAS_SIZE.height,
    toJSON: () => ({}),
  });
  document.body.append(canvas);

  const calls: string[] = [];
  const setViewport = jest.fn(
    (viewport: Viewport, _options?: { duration?: number }) => {
      calls.push(`move ${JSON.stringify(viewport)}`);
      return Promise.resolve(true);
    },
  );
  const onBeforeMove = jest.fn((viewport: Viewport) => {
    calls.push(`prepare ${JSON.stringify(viewport)}`);
  });
  const { result, rerender } = renderHook(
    ({ nodes }) =>
      useSchemaViewerZoomMethods({ setViewport }, nodes, onBeforeMove),
    { initialProps: { nodes } },
  );

  return { result, rerender, setViewport, onBeforeMove, calls, canvas };
}

function isVisible(viewport: Viewport, node: SchemaViewerFlowNode) {
  const left = viewport.x + node.position.x * viewport.zoom;
  const top = viewport.y + node.position.y * viewport.zoom;
  const right = left + (node.width ?? 0) * viewport.zoom;
  const bottom = top + (node.height ?? 0) * viewport.zoom;
  return (
    left >= 0 &&
    top >= 0 &&
    right <= CANVAS_SIZE.width &&
    bottom <= CANVAS_SIZE.height
  );
}

describe("useSchemaViewerZoomMethods", () => {
  let frameCallbacks: FrameRequestCallback[] = [];
  const flushFrame = () => {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    act(() => callbacks.forEach((callback) => callback(0)));
  };

  beforeEach(() => {
    frameCallbacks = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("zooms to a logical node that React Flow has not rendered", () => {
    const { result, setViewport } = setup([RENDERED, UNRENDERED]);

    result.current.zoomToNode(UNRENDERED.id);
    flushFrame();

    // Node 320px wide at (2000, 800) on a 1000x500 canvas: zoom clamps to 1,
    // the node is centered horizontally (x = 500 - 2160) and its top lands
    // 50px below the canvas top (y = 50 - 800).
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0][0]).toEqual({
      x: -1660,
      y: -750,
      zoom: 1,
    });
  });

  it("prepares the destination before moving, jumping on the first move only", () => {
    const { result, setViewport, onBeforeMove, calls } = setup([
      RENDERED,
      UNRENDERED,
    ]);

    result.current.zoomToNode(UNRENDERED.id);
    flushFrame();
    result.current.zoomToNode(RENDERED.id);
    flushFrame();

    const destination = { x: -1660, y: -750, zoom: 1 };
    expect(onBeforeMove).toHaveBeenNthCalledWith(1, destination, CANVAS_SIZE);
    expect(calls.slice(0, 2)).toEqual([
      `prepare ${JSON.stringify(destination)}`,
      `move ${JSON.stringify(destination)}`,
    ]);
    expect(setViewport.mock.calls[0][1]).toEqual({ duration: 0 });
    expect(setViewport.mock.calls[1][1]).toEqual({ duration: 500 });
  });

  it("fits every logical node, not only the rendered subset", () => {
    const { result, setViewport } = setup([RENDERED, UNRENDERED]);

    result.current.zoomToCanvas();
    flushFrame();

    expect(setViewport).toHaveBeenCalledTimes(1);
    const [viewport] = setViewport.mock.calls[0];
    expect(isVisible(viewport, RENDERED)).toBe(true);
    expect(isVisible(viewport, UNRENDERED)).toBe(true);
  });

  it("fits the graph once nodes arrive after the request", () => {
    const { result, rerender, setViewport } = setup([]);

    result.current.zoomToCanvas();
    flushFrame();
    expect(setViewport).not.toHaveBeenCalled();

    rerender({ nodes: [RENDERED, UNRENDERED] });
    flushFrame();

    expect(setViewport).toHaveBeenCalledTimes(1);
    const [viewport] = setViewport.mock.calls[0];
    expect(isVisible(viewport, RENDERED)).toBe(true);
    expect(isVisible(viewport, UNRENDERED)).toBe(true);
  });
});
