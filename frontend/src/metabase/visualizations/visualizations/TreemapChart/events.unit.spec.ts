import type { EChartsType } from "echarts/core";

import { getTreemapRootNodeId } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  TreemapChartColumns,
  TreemapRect,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";
import { TREEMAP_HOVER_OVERLAY_FILL } from "metabase/visualizations/echarts/graph/treemap/style";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeCard,
} from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import {
  dispatchTreemapViewRoot,
  getTreemapClickData,
  getTreemapEventHandlers,
} from "./events";
import {
  type TreemapHoverOverlay,
  type TreemapHoverOverlayRef,
  hideTreemapHoverOverlay,
} from "./overlay";

const groupingCol = createMockColumn({
  name: "Category",
  display_name: "Category",
  base_type: "type/Text",
});
const subGroupingCol = createMockColumn({
  name: "Product",
  display_name: "Product",
  base_type: "type/Text",
});
const valueCol = createMockColumn({
  name: "Sales",
  display_name: "Sales",
  base_type: "type/Number",
  semantic_type: "type/Number",
});

const cols1 = [groupingCol, valueCol];
const cols2 = [groupingCol, subGroupingCol, valueCol];

const treemapColumns1: TreemapChartColumns = {
  grouping: { index: 0, column: groupingCol },
  value: { index: 1, column: valueCol },
};
const treemapColumns2: TreemapChartColumns = {
  grouping: { index: 0, column: groupingCol },
  subGrouping: { index: 1, column: subGroupingCol },
  value: { index: 2, column: valueCol },
};

// One root, two leaves.
const tree2: TreemapTree = [
  {
    rawName: "Legumes",
    displayName: "Legumes",
    value: 30,
    rowIndices: [0, 1],
    children: [
      {
        rawName: "Chickpeas",
        displayName: "Chickpeas",
        value: 20,
        rowIndices: [0],
      },
      {
        rawName: "Lentils",
        displayName: "Lentils",
        value: 10,
        rowIndices: [1],
      },
    ],
  },
];
// Two roots, no children.
const tree1: TreemapTree = [
  { rawName: "Legumes", displayName: "Legumes", value: 30, rowIndices: [0] },
  { rawName: "Grains", displayName: "Grains", value: 15, rowIndices: [1] },
];

const settings = {} as ComputedVisualizationSettings;

const rawSeries1 = [
  {
    card: createMockCard(),
    data: createMockDatasetData({
      cols: cols1,
      rows: [
        ["Legumes", 30],
        ["Grains", 15],
      ],
    }),
  },
] as RawSeries;
const rawSeries2 = [
  {
    card: createMockCard(),
    data: createMockDatasetData({
      cols: cols2,
      rows: [
        ["Legumes", "Chickpeas", 20],
        ["Legumes", "Lentils", 10],
      ],
    }),
  },
] as RawSeries;

// A click event carrying the path-encoded node id plus the nested DOM event
// that `getTreemapClickData` forwards onto the `ClickObject`.
function makeClickEvent(id: unknown) {
  const domEvent = {} as MouseEvent;
  return { data: { id }, event: { event: domEvent } };
}

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

describe("getTreemapRootNodeId", () => {
  it("returns the id unchanged for a top-level grouping node", () => {
    expect(getTreemapRootNodeId("0")).toBe("0");
    expect(getTreemapRootNodeId("2")).toBe("2");
  });

  it("returns the grouping segment for a sub-group leaf node", () => {
    expect(getTreemapRootNodeId("0-1")).toBe("0");
    expect(getTreemapRootNodeId("3-12")).toBe("3");
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
    tree: tree2,
    treemapColumns: treemapColumns2,
    rawSeries: rawSeries2,
    settings,
    onVisualizationClick: jest.fn(),
  };

  it("drills DOWN (zoom) at the overview when there is sub-grouping", () => {
    const onDrillToGroup = jest.fn();
    const onVisualizationClick = jest.fn();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      onDrillToGroup,
      onVisualizationClick,
    });

    const clickHandler = handlers.find((h) => h.eventName === "click");
    expect(clickHandler).toBeDefined();

    clickHandler?.handler(makeClickEvent("1-4"));
    expect(onDrillToGroup).toHaveBeenLastCalledWith("1");

    clickHandler?.handler(makeClickEvent("0"));
    expect(onDrillToGroup).toHaveBeenLastCalledWith("0");

    // Overview clicks zoom, they never drill through.
    expect(onVisualizationClick).not.toHaveBeenCalled();
  });

  it("drills THROUGH on a 1-level node click (no zoom exists)", () => {
    const onDrillToGroup = jest.fn();
    const onVisualizationClick = jest.fn();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      hasChildren: false,
      tree: tree1,
      treemapColumns: treemapColumns1,
      rawSeries: rawSeries1,
      onDrillToGroup,
      onVisualizationClick,
    });

    handlers.find((h) => h.eventName === "click")?.handler(makeClickEvent("1"));

    expect(onDrillToGroup).not.toHaveBeenCalled();
    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    const clickData = onVisualizationClick.mock.calls[0][0];
    expect(clickData.value).toBe(15);
    expect(clickData.column).toBe(valueCol);
    expect(clickData.dimensions).toEqual([
      { column: groupingCol, value: "Grains" },
    ]);
  });

  it("drills THROUGH on a leaf click while drilled into a group (2-level)", () => {
    const onDrillToGroup = jest.fn();
    const onVisualizationClick = jest.fn();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      isDrilled: true,
      onDrillToGroup,
      onVisualizationClick,
    });

    handlers
      .find((h) => h.eventName === "click")
      ?.handler(makeClickEvent("0-1"));

    expect(onDrillToGroup).not.toHaveBeenCalled();
    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    const clickData = onVisualizationClick.mock.calls[0][0];
    expect(clickData.value).toBe(10);
    expect(clickData.column).toBe(valueCol);
    expect(clickData.dimensions).toEqual([
      { column: groupingCol, value: "Legumes" },
      { column: subGroupingCol, value: "Lentils" },
    ]);
  });

  it("ignores clicks without a string node id (background)", () => {
    const onDrillToGroup = jest.fn();
    const onVisualizationClick = jest.fn();
    const handlers = getTreemapEventHandlers({
      ...baseArgs,
      onDrillToGroup,
      onVisualizationClick,
    });
    const clickHandler = handlers.find((h) => h.eventName === "click");

    clickHandler?.handler({ data: undefined });
    clickHandler?.handler({});
    clickHandler?.handler({ data: { id: 5 } });

    expect(onDrillToGroup).not.toHaveBeenCalled();
    expect(onVisualizationClick).not.toHaveBeenCalled();
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

describe("getTreemapClickData", () => {
  it("returns null when the node id doesn't resolve to a tree node", () => {
    expect(
      getTreemapClickData({
        tree: tree2,
        id: "9-9",
        treemapColumns: treemapColumns2,
        rawSeries: rawSeries2,
        settings,
        event: makeClickEvent("9-9") as never,
      }),
    ).toBeNull();
  });

  it("omits dimensions for a native card (no field refs to filter on)", () => {
    const nativeRawSeries = [
      { card: createMockNativeCard(), data: rawSeries2[0].data },
    ] as RawSeries;

    const clickData = getTreemapClickData({
      tree: tree2,
      id: "0-1",
      treemapColumns: treemapColumns2,
      rawSeries: nativeRawSeries,
      settings,
      event: makeClickEvent("0-1") as never,
    });

    expect(clickData?.dimensions).toBeUndefined();
    expect(clickData?.value).toBe(10);
  });

  it("populates data with the clicked node's column values", () => {
    const clickData = getTreemapClickData({
      tree: tree2,
      id: "0-1",
      treemapColumns: treemapColumns2,
      rawSeries: rawSeries2,
      settings,
      event: makeClickEvent("0-1") as never,
    });

    expect(clickData?.data).toEqual([
      { col: groupingCol, value: "Legumes", key: "Category" },
      { col: subGroupingCol, value: "Lentils", key: "Product" },
      { col: valueCol, value: 10, key: "Sales" },
    ]);
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
