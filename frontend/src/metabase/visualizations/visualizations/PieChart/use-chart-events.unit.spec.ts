import { renderHook } from "@testing-library/react";
import type { EChartsType } from "echarts/core";
import type { MutableRefObject } from "react";

import { OTHER_SLICE_KEY } from "metabase/visualizations/echarts/pie/constants";
import type {
  PieChartModel,
  SliceTreeNode,
} from "metabase/visualizations/echarts/pie/model/types";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { useChartEvents } from "./use-chart-events";

const categoryColumn = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});

const countColumn = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/Integer",
  semantic_type: "type/Quantity",
});

function createSliceNode(
  key: string,
  name: string,
  rawValue: number,
  rowIndex: number,
): SliceTreeNode {
  return {
    key,
    name,
    value: rawValue,
    rawValue,
    normalizedPercentage: 0.5,
    visible: true,
    color: "",
    startAngle: 0,
    endAngle: 0,
    children: new Map(),
    column: categoryColumn,
    rowIndex,
    isOther: true,
  };
}

function createChartModel(): PieChartModel {
  const otherNode: SliceTreeNode = {
    key: OTHER_SLICE_KEY,
    name: "Other",
    value: 93,
    rawValue: 93,
    normalizedPercentage: 0.465,
    visible: true,
    color: "",
    startAngle: 0,
    endAngle: 0,
    children: new Map([
      ["Gizmo", createSliceNode("Gizmo", "Gizmo", 51, 0)],
      ["Doohickey", createSliceNode("Doohickey", "Doohickey", 42, 1)],
    ]),
    column: categoryColumn,
    isOther: true,
    includeInLegend: true,
    legendHoverIndex: 2,
  };

  return {
    sliceTree: new Map([[OTHER_SLICE_KEY, otherNode]]),
    total: 200,
    numRings: 1,
    colDescs: {
      metricDesc: { index: 1, column: countColumn },
      dimensionDesc: { index: 0, column: categoryColumn },
    },
  };
}

function createVisualizationProps(
  onVisualizationClick: (clickObject: ClickObject | null) => void,
): VisualizationProps {
  const card = createMockCard();
  const data = createMockDatasetData({
    rows: [
      ["Gizmo", 51],
      ["Doohickey", 42],
    ],
    cols: [categoryColumn, countColumn],
  });
  const series = createMockSingleSeries(card, { data });

  return {
    series: [series],
    rawSeries: [series],
    data,
    card,
    settings: createMockVisualizationSettings({
      "pie.metric": "count",
      "pie.dimension": ["CATEGORY"],
    }),
    fontFamily: "Lato",
    isFullscreen: false,
    isQueryBuilder: false,
    isEmbeddingSdk: false,
    showTitle: false,
    isDashboard: false,
    isDocument: false,
    isVisualizer: false,
    isVisualizerCard: false,
    isEditing: false,
    isMetricsViewer: false,
    isMobile: false,
    isSettings: false,
    width: 500,
    height: 300,
    visualizationIsClickable: () => true,
    onRender: () => undefined,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange: () => undefined,
    onVisualizationClick,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: jest.fn(),
  };
}

describe("useChartEvents", () => {
  it("emits grouped dimensions when the Other slice is clicked (#5334)", () => {
    const onVisualizationClick = jest.fn();
    const chartRef: MutableRefObject<EChartsType | undefined> = {
      current: undefined,
    };

    const { result } = renderHook(() =>
      useChartEvents(
        createVisualizationProps(onVisualizationClick),
        chartRef,
        createChartModel(),
      ),
    );

    const clickHandler = result.current.find(
      (handler) => handler.eventName === "click",
    );

    clickHandler?.handler({
      name: OTHER_SLICE_KEY,
      event: { event: new MouseEvent("click") },
    });

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 93,
        column: countColumn,
        dimensions: [
          {
            value: ["Gizmo", "Doohickey"],
            column: categoryColumn,
          },
        ],
      }),
    );
  });
});
