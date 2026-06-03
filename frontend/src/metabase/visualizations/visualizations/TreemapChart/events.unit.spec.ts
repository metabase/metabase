import type { EChartsType } from "echarts/core";

import type { TreemapRect } from "metabase/visualizations/echarts/graph/treemap/model/labels";

import {
  TREEMAP_HOVER_OVERLAY_FILL,
  type TreemapHoverOverlay,
  type TreemapHoverOverlayRef,
  dispatchTreemapViewRoot,
  getTreemapDrillTargetNodeId,
  getTreemapEventHandlers,
  hideTreemapHoverOverlay,
} from "./events";

function makeChartRef(overrides: Record<string, unknown> = {}) {
  const dispatchAction = jest.fn();
  const setOption = jest.fn();
  const add = jest.fn();
  const remove = jest.fn();
  const zr = { add, remove };
  const chartRef = {
    current: {
      dispatchAction,
      setOption,
      isDisposed: () => false,
      getZr: () => zr,
      ...overrides,
    },
  } as unknown as React.MutableRefObject<EChartsType | undefined>;
  return { chartRef, dispatchAction, setOption, add, remove };
}

function makeOverlayRef(): TreemapHoverOverlayRef {
  return { current: null };
}

describe("getTreemapDrillTargetNodeId", () => {
  it("returns the id unchanged for a top-level grouping node", () => {
    expect(getTreemapDrillTargetNodeId("0")).toBe("0");
    expect(getTreemapDrillTargetNodeId("2")).toBe("2");
  });

  it("returns the grouping segment for a sub-group leaf node", () => {
    expect(getTreemapDrillTargetNodeId("0-1")).toBe("0");
    expect(getTreemapDrillTargetNodeId("3-12")).toBe("3");
  });
});

function makeChartRefWithNode(id: string, rect: TreemapRect | null) {
  return makeChartRef({
    getModel: () => ({
      getSeriesByIndex: () => ({
        getRawData: () => ({
          tree: {
            root: {
              eachNode: (cb: (node: unknown) => void) =>
                cb({ getId: () => id, getLayout: () => rect }),
            },
          },
        }),
      }),
    }),
  });
}

describe("getTreemapEventHandlers", () => {
  const baseArgs = {
    chartRef: makeChartRef().chartRef,
    overlayRef: makeOverlayRef(),
    hasChildren: true,
    isDrilled: false,
    onDrillToGroup: jest.fn(),
  };

  it("has no click handler for a 1-level treemap (no drill)", () => {
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      hasChildren: false,
    });
    expect(handlers.find((h) => h.eventName === "click")).toBeUndefined();
  });

  it("reports the clicked node's grouping as the drill target", () => {
    const onDrillToGroup = jest.fn();
    const handlers = getTreemapEventHandlers({ ...baseArgs, onDrillToGroup });

    const clickHandler = handlers.find((h) => h.eventName === "click");
    expect(clickHandler).toBeDefined();

    clickHandler?.handler({ data: { id: "1-4" } });
    expect(onDrillToGroup).toHaveBeenLastCalledWith("1");

    clickHandler?.handler({ data: { id: "0" } });
    expect(onDrillToGroup).toHaveBeenLastCalledWith("0");
  });

  it("ignores clicks without a string node id (background)", () => {
    const onDrillToGroup = jest.fn();
    const handlers = getTreemapEventHandlers({ ...baseArgs, onDrillToGroup });
    const clickHandler = handlers.find((h) => h.eventName === "click");

    clickHandler?.handler({ data: undefined });
    clickHandler?.handler({});
    clickHandler?.handler({ data: { id: 5 } });

    expect(onDrillToGroup).not.toHaveBeenCalled();
  });

  it("wires hover overlay handlers both at the overview and while drilled", () => {
    for (const isDrilled of [false, true]) {
      const handlers = getTreemapEventHandlers({ ...baseArgs, isDrilled });
      expect(handlers.map((h) => h.eventName)).toEqual(
        expect.arrayContaining(["mouseover", "globalout"]),
      );
    }
  });

  it("washes the hovered element's whole section on mouseover at the overview", () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    const { chartRef, add } = makeChartRefWithNode("1", rect);
    const overlayRef = makeOverlayRef();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      chartRef,
      overlayRef,
    });
    const mouseover = handlers.find((h) => h.eventName === "mouseover");

    // Hovering a leaf "1-4" overlays its top-level section "1".
    mouseover?.handler({ data: { id: "1-4" } });

    expect(add).toHaveBeenCalledTimes(1);
    expect(overlayRef.current?.shape).toMatchObject(rect);
    expect(overlayRef.current?.style).toMatchObject({
      fill: TREEMAP_HOVER_OVERLAY_FILL,
    });
    expect(overlayRef.current?.silent).toBe(true);
  });

  it("washes just the hovered leaf tile on mouseover while drilled", () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    const { chartRef, add } = makeChartRefWithNode("1-4", rect);
    const overlayRef = makeOverlayRef();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      chartRef,
      overlayRef,
      isDrilled: true,
    });
    const mouseover = handlers.find((h) => h.eventName === "mouseover");

    // Drilled: hovering leaf "1-4" overlays that exact tile, not section "1".
    mouseover?.handler({ data: { id: "1-4" } });

    expect(add).toHaveBeenCalledTimes(1);
    expect(overlayRef.current?.shape).toMatchObject(rect);
  });

  it("repositions the existing overlay rather than adding a second one", () => {
    const first = { x: 0, y: 0, width: 10, height: 10 };
    const second = { x: 50, y: 50, width: 20, height: 20 };
    const { chartRef, add } = makeChartRefWithNode("1", first);
    const overlayRef = makeOverlayRef();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      chartRef,
      overlayRef,
    });
    const mouseover = handlers.find((h) => h.eventName === "mouseover");

    mouseover?.handler({ data: { id: "1" } });
    // Re-point the fake chart's node rect, then hover again.
    (chartRef.current as unknown as { getModel: unknown }).getModel = () => ({
      getSeriesByIndex: () => ({
        getRawData: () => ({
          tree: {
            root: {
              eachNode: (cb: (node: unknown) => void) =>
                cb({ getId: () => "1", getLayout: () => second }),
            },
          },
        }),
      }),
    });
    mouseover?.handler({ data: { id: "1" } });

    expect(add).toHaveBeenCalledTimes(1);
    expect(overlayRef.current?.shape).toMatchObject(second);
  });

  it("does not paint an overlay when the section has no laid-out rect", () => {
    const { chartRef, add } = makeChartRefWithNode("1", null);
    const overlayRef = makeOverlayRef();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      chartRef,
      overlayRef,
    });
    const mouseover = handlers.find((h) => h.eventName === "mouseover");

    mouseover?.handler({ data: { id: "1" } });

    expect(add).not.toHaveBeenCalled();
    expect(overlayRef.current).toBeNull();
  });

  it("clears the overlay when the cursor leaves the chart (globalout)", () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    const { chartRef, add, remove } = makeChartRefWithNode("1", rect);
    const overlayRef = makeOverlayRef();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      chartRef,
      overlayRef,
    });

    handlers
      .find((h) => h.eventName === "mouseover")
      ?.handler({
        data: { id: "1" },
      });
    const overlay = overlayRef.current;
    expect(add).toHaveBeenCalledTimes(1);

    handlers.find((h) => h.eventName === "globalout")?.handler({});

    expect(remove).toHaveBeenCalledWith(overlay);
    expect(overlayRef.current).toBeNull();
  });
});

describe("hideTreemapHoverOverlay", () => {
  it("is a no-op when there's no overlay", () => {
    const { chartRef, remove } = makeChartRef();
    const overlayRef = makeOverlayRef();

    hideTreemapHoverOverlay(chartRef, overlayRef);

    expect(remove).not.toHaveBeenCalled();
    expect(overlayRef.current).toBeNull();
  });

  it("clears the ref even when the chart is already disposed", () => {
    const { chartRef, remove } = makeChartRef({ isDisposed: () => true });
    const overlayRef = {
      current: {} as TreemapHoverOverlay,
    };

    hideTreemapHoverOverlay(chartRef, overlayRef);

    expect(remove).not.toHaveBeenCalled();
    expect(overlayRef.current).toBeNull();
  });
});

describe("dispatchTreemapViewRoot", () => {
  it("dispatches treemapRootToNode for a drilled-in view root", () => {
    const { chartRef, dispatchAction } = makeChartRef();

    dispatchTreemapViewRoot(chartRef, "1");

    expect(dispatchAction).toHaveBeenCalledWith({
      type: "treemapRootToNode",
      seriesIndex: 0,
      targetNode: "1",
    });
  });

  it("does nothing for the overview (null view root) — setOption already renders the root", () => {
    const { chartRef, dispatchAction } = makeChartRef();

    dispatchTreemapViewRoot(chartRef, null);

    expect(dispatchAction).not.toHaveBeenCalled();
  });

  it("is a no-op when the chart isn't ready", () => {
    const chartRef = {
      current: undefined,
    } as React.MutableRefObject<EChartsType | undefined>;

    expect(() => dispatchTreemapViewRoot(chartRef, "0")).not.toThrow();
  });
});
