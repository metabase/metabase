import { act, renderHook } from "@testing-library/react";
import type { EChartsType } from "echarts/core";
import type { MutableRefObject } from "react";

import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { useLabelMeasurement } from "./use-label-measurement";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 10,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const formatters = { value: (value: number) => String(value) };

const TREE: TreemapTree = [
  {
    rawName: "G",
    displayName: "G",
    value: 100,
    rowIndices: [0, 1],
    children: [
      { rawName: "Big", displayName: "Big", value: 98, rowIndices: [0] },
      { rawName: "Tiny", displayName: "Tiny", value: 2, rowIndices: [1] },
    ],
  },
];

// A echarts fake laid-out tree exposing exactly what `getTreemapLayoutNodes` gets
function createMockChartRef(
  layouts: Record<string, { width: number; height: number }>,
) {
  const fakeNodes = Object.entries(layouts).map(([id, rect]) => ({
    getId: () => id,
    getLayout: () => ({ x: 0, y: 0, ...rect }),
    children: id.includes("-") ? [] : [{}],
  }));
  const chart = {
    getModel: () => ({
      getSeriesByIndex: () => ({
        getRawData: () => ({
          tree: {
            root: {
              eachNode: (cb: (node: unknown) => void) => fakeNodes.forEach(cb),
            },
          },
        }),
      }),
    }),
  } as unknown as EChartsType;
  return { current: chart } as MutableRefObject<EChartsType | undefined>;
}

function setup({ viewRootId = null }: { viewRootId?: string | null } = {}) {
  const chartRef = createMockChartRef({
    "0": { width: 600, height: 400 },
    "0-0": { width: 400, height: 400 },
    "0-1": { width: 200, height: 400 },
  });

  return renderHook(
    (props: { viewRootId: string | null }) =>
      useLabelMeasurement({
        chartRef,
        tree: TREE,
        formatters,
        renderingContext,
        viewRootId: props.viewRootId,
        showLeafValues: true,
        showParentValues: true,
      }),
    { initialProps: { viewRootId } },
  );
}

describe("useLabelMeasurement", () => {
  it("starts with empty layout maps before the first measurement", () => {
    const { result } = setup();

    expect(result.current.labelLayout).toEqual({});
    expect(result.current.parentLabelLayout).toEqual({});
  });

  it("exposes the measured layouts after a finished-event measurement", () => {
    const { result } = setup();

    act(() => result.current.handleLabelMeasure());

    expect(result.current.labelLayout["0-0"]).toMatchObject({ show: true });
    expect(result.current.labelLayout["0-1"]).toMatchObject({ show: true });
    expect(result.current.parentLabelLayout["0"]).toMatchObject({
      showText: true,
    });
  });

  it("hides labels on zoomin and zoom out animations", () => {
    const { result, rerender } = setup();

    rerender({ viewRootId: "0" });
    expect(result.current.labelLayout).toEqual({});
    expect(result.current.parentLabelLayout).toEqual({});

    act(() => result.current.handleLabelMeasure());
    expect(result.current.labelLayout["0-0"]).toMatchObject({ show: true });

    rerender({ viewRootId: null });
    expect(result.current.labelLayout).toEqual({});

    act(() => result.current.handleLabelMeasure());

    expect(result.current.labelLayout["0-1"]).toMatchObject({ show: true });
  });
});
