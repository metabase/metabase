import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import { color } from "metabase/ui/utils/colors";
import { checkNotNull } from "metabase/utils/types";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTotalValue } from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import { CLICKED_DATA_POINT_HIGHLIGHT_DURATION } from "metabase/visualizations/constants";
import {
  DIMENSIONS,
  OPTION_NAME_SEPERATOR,
} from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { EChartsSunburstSeriesMouseEvent } from "metabase/visualizations/echarts/pie/types";
import {
  getArrayFromMapValues,
  getSliceKeyPath,
  getSliceTreeNodesFromPath,
} from "metabase/visualizations/echarts/pie/util";
import {
  getMarkerColorClass,
  useClickedStateTooltipSync,
} from "metabase/visualizations/echarts/tooltip";
import { MENTION_HIGHLIGHT_CONTRACT_DURATION } from "metabase/visualizations/lib/mention-highlight";
import { getValueFromDimensionKey } from "metabase/visualizations/shared/settings/pie";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

const isSameColumn = (
  left: ClickObject["column"],
  right: ClickObject["column"],
) => {
  if (!left || !right) {
    return false;
  }

  return (
    left === right ||
    (left.name != null && left.name === right.name) ||
    (left.display_name != null && left.display_name === right.display_name)
  );
};

const isSameClickValue = (left: unknown, right: unknown) => {
  return left === right || String(left) === String(right);
};

const getClickedSliceKeyPath = (
  chartModel: PieChartModel,
  clicked: ClickObject | null | undefined,
) => {
  if (!clicked) {
    return null;
  }

  const dimensions = clicked.dimensions ?? [];

  const findClickedSliceKeyPath = (
    sliceTree: PieChartModel["sliceTree"],
    path: string[],
    matchedDimensionsCount: number,
  ): string[] | null => {
    for (const slice of getArrayFromMapValues(sliceTree)) {
      if (!slice.visible || slice.isOther) {
        continue;
      }

      const dimension = dimensions.find((dimension) =>
        isSameColumn(dimension.column, slice.column),
      );

      if (
        dimension != null &&
        !isSameClickValue(getValueFromDimensionKey(slice.key), dimension.value)
      ) {
        continue;
      }

      const nextPath = [...path, slice.key];
      const nextMatchedDimensionsCount =
        matchedDimensionsCount + (dimension == null ? 0 : 1);
      const childMatch = findClickedSliceKeyPath(
        slice.children,
        nextPath,
        nextMatchedDimensionsCount,
      );
      if (childMatch != null) {
        return childMatch;
      }

      const hasMatchedDimension =
        dimensions.length === 0 || nextMatchedDimensionsCount > 0;
      const hasMatchingValue =
        clicked.value === undefined ||
        isSameClickValue(slice.value, clicked.value) ||
        isSameClickValue(slice.rawValue, clicked.value);

      if (hasMatchedDimension && hasMatchingValue) {
        return nextPath;
      }
    }

    return null;
  };

  return findClickedSliceKeyPath(chartModel.sliceTree, [], 0);
};

export const getClickedSliceName = (
  chartModel: PieChartModel,
  clicked: ClickObject | null | undefined,
) => getClickedSliceKeyPath(chartModel, clicked)?.join(OPTION_NAME_SEPERATOR);

export const getTooltipModel = (
  sliceKeyPath: string[],
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): EChartsTooltipModel => {
  const { sliceTreeNode, nodes } = getSliceTreeNodesFromPath(
    chartModel.sliceTree,
    sliceKeyPath,
  );
  const siblingNodes = getArrayFromMapValues(
    nodes.length >= 2 ? nodes[nodes.length - 2].children : chartModel.sliceTree,
  );

  const rows = (
    sliceTreeNode.isOther
      ? getArrayFromMapValues(sliceTreeNode.children)
      : siblingNodes
  )
    .filter((node) => node.visible)
    .map((slice) => ({
      name: slice.name,
      value: slice.rawValue,
      color: nodes.length === 1 ? slice.color : undefined,
      formatter: formatters.formatMetric,
      key: slice.key,
      normalizedPercentage: slice.normalizedPercentage,
    }));
  const rowsTotal = getTotalValue(rows);

  const formattedRows: EChartsTooltipRow[] = rows.map((row) => {
    const markerColorClass = row.color
      ? getMarkerColorClass(row.color)
      : undefined;
    return {
      isFocused: !sliceTreeNode.isOther && row.key === sliceTreeNode.key,
      markerColorClass,
      name: row.name,
      values: [
        row.formatter(row.value),
        formatPercent(row.normalizedPercentage),
      ],
    };
  });

  return {
    header:
      nodes.length === 1
        ? sliceTreeNode.column?.display_name
        : nodes
            .slice(0, -1)
            .map((node) => node.name)
            .join("  >  "),
    rows: formattedRows,
    footer:
      rows.length > 1
        ? {
            name: t`Total`,
            values: [formatters.formatMetric(rowsTotal), formatPercent(1)],
          }
        : undefined,
  };
};

function getHoverData(
  event: EChartsSunburstSeriesMouseEvent,
  chartModel: PieChartModel,
) {
  if (event.dataIndex == null) {
    return null;
  }

  const pieSliceKeyPath = getSliceKeyPath(event);

  const dimensionNode = chartModel.sliceTree.get(pieSliceKeyPath[0]);
  if (dimensionNode == null) {
    throw Error(`Could not find dimensionNode for key ${pieSliceKeyPath[0]}`);
  }

  return {
    index: dimensionNode.legendHoverIndex,
    event: event.event.event,
    pieSliceKeyPath,
  };
}

function handleClick(
  event: EChartsSunburstSeriesMouseEvent,
  dataProp: VisualizationProps["data"],
  settings: VisualizationProps["settings"],
  visualizationIsClickable: VisualizationProps["visualizationIsClickable"],
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  chartModel: PieChartModel,
) {
  if (event.dataIndex == null) {
    return;
  }

  const { sliceTreeNode, nodes } = getSliceTreeNodesFromPath(
    chartModel.sliceTree,
    getSliceKeyPath(event),
  );

  if (sliceTreeNode.isOther) {
    return;
  }

  const rowIndex = sliceTreeNode.rowIndex;
  const row = rowIndex != null ? dataProp.rows[rowIndex] : undefined;

  // the underlying records filter doesn't support objects, so return early if any of the dimension values are objects
  if (
    row &&
    [
      chartModel.colDescs.dimensionDesc.index,
      chartModel.colDescs.middleDimensionDesc?.index,
      chartModel.colDescs.outerDimensionDesc?.index,
    ]
      .filter((index) => index != null)
      .map((index) => row[index])
      .some((value) => value != null && typeof value === "object")
  ) {
    return;
  }

  const data =
    row != null
      ? row.map((value, index) => ({
          value,
          col: dataProp.cols[index],
        }))
      : undefined;

  if (data != null) {
    data[chartModel.colDescs.metricDesc.index].value = sliceTreeNode.rawValue;
  }

  const clickObject: ClickObject = {
    value: sliceTreeNode.value,
    column: chartModel.colDescs.metricDesc.column,
    data,
    dimensions: nodes.map((node) => ({
      value: getValueFromDimensionKey(node.key),
      column: checkNotNull(node.column),
    })),
    settings,
    event: event.event.event,
  };

  if (visualizationIsClickable(clickObject)) {
    onVisualizationClick(clickObject);
  }
}

let pieMentionRingCounter = 0;

// Draws a brand-colored ring at a highlighted pie slice's centroid that starts
// larger and contracts onto it, then fades out — so the highlight feels like it
// "lands" on the slice. The persistent select border remains.
function animatePieMentionContractRing(
  chart: EChartsType,
  slice: { startAngle: number; endAngle: number },
) {
  const { startAngle, endAngle } = slice;
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
    return;
  }

  const width = chart.getWidth();
  const height = chart.getHeight();
  const cx = width / 2;
  const cy = height / 2;
  // Mirrors the pie radius computation (see getRadiusOption): the pie is square,
  // inset by the side padding, with the inner ring at a fixed ratio.
  const sideLength = Math.min(width, height);
  const outerRadius = (sideLength - DIMENSIONS.padding.side * 2) / 2;
  const innerRadius = outerRadius * DIMENSIONS.slice.innerRadiusRatio;
  const midRadius = (innerRadius + outerRadius) / 2;
  if (!Number.isFinite(midRadius) || midRadius <= 0) {
    return;
  }

  // d3/ECharts pie angles are measured clockwise from the top (12 o'clock).
  const midAngle = (startAngle + endAngle) / 2;
  const px = cx + midRadius * Math.sin(midAngle);
  const py = cy - midRadius * Math.cos(midAngle);

  const brandColor = color("brand");
  const id = `pie-mention-contract-ring-${pieMentionRingCounter++}`;

  chart.setOption(
    {
      graphic: [
        {
          id,
          type: "circle",
          z: 1000,
          silent: true,
          shape: { cx: px, cy: py, r: 16 },
          style: { fill: "none", stroke: brandColor, lineWidth: 2 },
          originX: px,
          originY: py,
          scaleX: 1,
          scaleY: 1,
          transition: ["scaleX", "scaleY", "style"],
          transitionDuration: MENTION_HIGHLIGHT_CONTRACT_DURATION / 1000,
          enterFrom: { scaleX: 2.5, scaleY: 2.5, style: { opacity: 0 } },
        },
      ],
    },
    false,
  );

  window.setTimeout(() => {
    if (chart.isDisposed()) {
      return;
    }
    chart.setOption(
      {
        graphic: [
          {
            id,
            scaleX: 0.6,
            scaleY: 0.6,
            style: { opacity: 0 },
            transition: ["scaleX", "scaleY", "style"],
            transitionDuration: MENTION_HIGHLIGHT_CONTRACT_DURATION / 1000,
          },
        ],
      },
      false,
    );
    window.setTimeout(() => {
      if (!chart.isDisposed()) {
        chart.setOption({ graphic: [{ id, $action: "remove" }] }, false);
      }
    }, MENTION_HIGHLIGHT_CONTRACT_DURATION);
  }, MENTION_HIGHLIGHT_CONTRACT_DURATION);
}

export function useChartEvents(
  props: VisualizationProps,
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: PieChartModel,
) {
  const {
    onHoverChange,
    data,
    settings,
    visualizationIsClickable,
    onVisualizationClick,
  } = props;
  // We use `pieLegendHoverIndex` instead of `hovered.index` because we only
  // want to manually highlight and downplay when the user hovers over the
  // legend. If the user hovers over the chart, echarts will handle highlighting
  // the chart itself.
  const legendHoverIndex = props.hovered?.pieLegendHoverIndex;
  const chart = chartRef?.current;

  useEffect(
    function higlightChartOnLegendHover() {
      if (chart == null || legendHoverIndex == null) {
        return;
      }

      const name = getArrayFromMapValues(chartModel.sliceTree)[legendHoverIndex]
        .key;

      chart.dispatchAction({
        type: "highlight",
        name,
        seriesIndex: 0,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          name,
          seriesIndex: 0,
        });
      };
    },
    [chart, chartModel, legendHoverIndex],
  );

  useClickedStateTooltipSync(
    chartRef.current,
    props.clickedViaMention ?? props.clicked,
  );

  useEffect(
    function highlightClickedSlice() {
      const activeClicked = props.clickedViaMention ?? props.clicked;
      const isMention = props.clickedViaMention != null;
      const actionType = isMention ? "select" : "highlight";
      const clearActionType = isMention ? "unselect" : "downplay";

      if (chart == null || activeClicked == null) {
        return;
      }

      const name = getClickedSliceName(chartModel, activeClicked);
      if (name == null) {
        return;
      }

      chart.dispatchAction({
        type: actionType,
        name,
        seriesIndex: 0,
      });

      // The `select` state only adds the brand border to the clicked slice;
      // it does not dim the others. Additionally emphasizing the slice triggers
      // the series' `emphasis.focus: "ancestor"`, which blurs the sibling slices
      // (fading them via the `blur` itemStyle) so the selected slice stands out.
      if (isMention) {
        chart.dispatchAction({
          type: "highlight",
          name,
          seriesIndex: 0,
        });
      }

      const sliceKeyPath = getClickedSliceKeyPath(chartModel, activeClicked);
      if (sliceKeyPath != null) {
        const { sliceTreeNode } = getSliceTreeNodesFromPath(
          chartModel.sliceTree,
          sliceKeyPath,
        );
        if (sliceTreeNode != null) {
          animatePieMentionContractRing(chart, sliceTreeNode);
        }
      }

      const clearHighlight = () => {
        chart.dispatchAction({
          type: clearActionType,
          name,
          seriesIndex: 0,
        });
        if (isMention) {
          chart.dispatchAction({
            type: "downplay",
            name,
            seriesIndex: 0,
          });
        }
      };

      const timeoutId = window.setTimeout(
        clearHighlight,
        CLICKED_DATA_POINT_HIGHLIGHT_DURATION,
      );

      return () => {
        window.clearTimeout(timeoutId);
        clearHighlight();
      };
    },
    [chart, chartModel, props.clicked, props.clickedViaMention],
  );

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "mouseout",
        query: "series",
        handler: () => {
          onHoverChange?.(null);
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: (event: EChartsSunburstSeriesMouseEvent) => {
          onHoverChange?.(getHoverData(event, chartModel));
        },
      },
      {
        eventName: "click",
        query: "series",
        handler: (event: EChartsSunburstSeriesMouseEvent) => {
          handleClick(
            event,
            data,
            settings,
            visualizationIsClickable,
            onVisualizationClick,
            chartModel,
          );
        },
      },
    ],
    [
      onHoverChange,
      data,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      chartModel,
    ],
  );

  return eventHandlers;
}
