import type { EChartsType } from "echarts/core";

import { getTreemapDrillTargetNodeId, getTreemapEventHandlers } from "./events";

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

describe("getTreemapEventHandlers", () => {
  function makeChartRef() {
    const dispatchAction = jest.fn();
    const chartRef = {
      current: { dispatchAction },
    } as unknown as React.MutableRefObject<EChartsType | undefined>;
    return { chartRef, dispatchAction };
  }

  it("returns no handlers for a 1-level treemap", () => {
    const { chartRef } = makeChartRef();
    expect(getTreemapEventHandlers(chartRef, false)).toEqual([]);
  });

  it("drills into the clicked node's grouping on click", () => {
    const { chartRef, dispatchAction } = makeChartRef();
    const handlers = getTreemapEventHandlers(chartRef, true);

    expect(handlers).toHaveLength(1);
    expect(handlers[0].eventName).toBe("click");

    handlers[0].handler({ data: { id: "1-4" } });

    expect(dispatchAction).toHaveBeenCalledWith({
      type: "treemapRootToNode",
      seriesIndex: 0,
      targetNode: "1",
    });
  });

  it("drills into a top-level grouping clicked directly", () => {
    const { chartRef, dispatchAction } = makeChartRef();
    const handlers = getTreemapEventHandlers(chartRef, true);

    handlers[0].handler({ data: { id: "2" } });

    expect(dispatchAction).toHaveBeenCalledWith({
      type: "treemapRootToNode",
      seriesIndex: 0,
      targetNode: "2",
    });
  });

  it("ignores clicks without a string node id (breadcrumb / background)", () => {
    const { chartRef, dispatchAction } = makeChartRef();
    const handlers = getTreemapEventHandlers(chartRef, true);

    handlers[0].handler({ data: undefined });
    handlers[0].handler({});
    handlers[0].handler({ data: { id: 5 } });

    expect(dispatchAction).not.toHaveBeenCalled();
  });
});
