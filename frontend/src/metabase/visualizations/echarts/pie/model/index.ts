import { pie } from "d3";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { checkNotNull } from "metabase/lib/types";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import {
  pieNegativesWarning,
  unaggregatedDataWarningPie,
} from "metabase/visualizations/lib/warnings";
import {
  getAggregatedRows,
  getKeyFromDimensionValue,
  getPieDimensions,
} from "metabase/visualizations/shared/settings/pie";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import type { ShowWarning } from "../../types";
import {
  OTHER_SLICE_KEY,
  OTHER_SLICE_MIN_PERCENTAGE,
  OTHER_SLICE_NAME,
} from "../constants";
import { getDimensionFormatter } from "../format";
import { getArrayFromMapValues } from "../util";
import { getColorForRing } from "../util/colors";

import type {
  PieChartModel,
  PieColumnDescriptors,
  SliceTree,
  SliceTreeNode,
} from "./types";

export function getPieColumns(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): PieColumnDescriptors {
  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const metric = findWithIndex(cols, c => c.name === settings["pie.metric"]);

  const dimensionColNames = getPieDimensions(settings);
  const dimension = findWithIndex(cols, c => c.name === dimensionColNames[0]);

  if (!dimension.item || !metric.item) {
    throw new Error(
      `Could not find columns based on "pie.dimension" (${settings["pie.dimension"]}) and "pie.metric" (${settings["pie.metric"]}) settings.`,
    );
  }

  const colDescs: PieColumnDescriptors = {
    dimensionDesc: {
      index: dimension.index,
      column: dimension.item,
    },
    metricDesc: {
      index: metric.index,
      column: metric.item,
    },
  };

  if (dimensionColNames.length > 1) {
    const middleDimension = findWithIndex(
      cols,
      c => c.name === dimensionColNames[1],
    );
    if (!middleDimension.item) {
      throw new Error(
        `Could not find column based on "pie.dimension" (${settings["pie.dimension"]})`,
      );
    }

    colDescs.middleDimensionDesc = {
      index: middleDimension.index,
      column: middleDimension.item,
    };
  }

  if (dimensionColNames.length > 2) {
    const outerDimension = findWithIndex(
      cols,
      c => c.name === dimensionColNames[2],
    );
    if (!outerDimension.item) {
      throw new Error(
        `Could not find column based on "pie.dimension" (${settings["pie.dimension"]})`,
      );
    }

    colDescs.outerDimensionDesc = {
      index: outerDimension.index,
      column: outerDimension.item,
    };
  }

  return colDescs;
}

function aggregateSlices(
  node: SliceTreeNode,
  total: number,
  renderingContext: RenderingContext,
) {
  const children = getArrayFromMapValues(node.children);
  const others = children.filter(s => s.isOther);
  const otherTotal = others.reduce((currTotal, o) => currTotal + o.value, 0);

  if (others.length > 1 && otherTotal > 0) {
    const otherSliceChildren: SliceTree = new Map();
    others.forEach(o => {
      otherSliceChildren.set(String(o.key), { ...o, color: "" });
      node.children.delete(String(o.key));
    });

    node.children.set(OTHER_SLICE_KEY, {
      key: OTHER_SLICE_KEY,
      name: OTHER_SLICE_NAME,
      value: otherTotal,
      displayValue: otherTotal,
      normalizedPercentage: otherTotal / total,
      color: renderingContext.getColor("text-light"),
      children: otherSliceChildren,
      visible: true,
      isOther: true,
      startAngle: 0,
      endAngle: 0,
    });
  } else if (others.length === 1) {
    others[0].isOther = false;
  }

  children.forEach(child => aggregateSlices(child, total, renderingContext));
}

function computeSliceAngles(
  slices: SliceTreeNode[],
  startAngle?: number,
  endAngle?: number,
) {
  const d3Pie = pie<SliceTreeNode>()
    .sort(null)
    // 1 degree in radians
    .padAngle((Math.PI / 180) * 1)
    .startAngle(startAngle ?? 0)
    .endAngle(endAngle ?? 2 * Math.PI)
    .value(s => s.value);

  const d3Slices = d3Pie(slices, { startAngle, endAngle });
  d3Slices.forEach((d3Slice, index) => {
    slices[index].startAngle = d3Slice.startAngle;
    slices[index].endAngle = d3Slice.endAngle;
  });

  slices.forEach(slice =>
    computeSliceAngles(
      getArrayFromMapValues(slice.children),
      slice.startAngle,
      slice.endAngle,
    ),
  );
}

function countNumRings(node: SliceTreeNode, numRings = 0): number {
  if (node.isOther) {
    return numRings + 1;
  }

  return Math.max(
    ...getArrayFromMapValues(node.children).map(node =>
      countNumRings(node, numRings + 1),
    ),
    numRings + 1,
  );
}

export function getPieChartModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  hiddenSlices: Array<string | number> = [],
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): PieChartModel {
  const [
    {
      data: { rows: dataRows },
    },
  ] = rawSeries;
  const colDescs = getPieColumns(rawSeries, settings);

  const rowIndiciesByKey = new Map<string | number, number>();
  dataRows.forEach((row, index) => {
    const key = getKeyFromDimensionValue(row[colDescs.dimensionDesc.index]);

    if (rowIndiciesByKey.has(key)) {
      return;
    }
    rowIndiciesByKey.set(key, index);
  });

  const aggregatedRows = getAggregatedRows(
    dataRows,
    colDescs.dimensionDesc.index,
    colDescs.metricDesc.index,
    colDescs.middleDimensionDesc == null ? showWarning : undefined,
    colDescs.dimensionDesc.column,
  );

  const rowValuesByKey = new Map<string | number, number>();
  aggregatedRows.map(row =>
    rowValuesByKey.set(
      getKeyFromDimensionValue(row[colDescs.dimensionDesc.index]),
      getNumberOr(row[colDescs.metricDesc.index], 0),
    ),
  );

  const pieRows = settings["pie.rows"];
  if (pieRows == null) {
    throw Error("missing `pie.rows` setting");
  }

  const enabledPieRows = pieRows.filter(row => row.enabled && !row.hidden);

  const pieRowsWithValues = enabledPieRows.map(pieRow => {
    const value = rowValuesByKey.get(pieRow.key);
    if (value === undefined) {
      throw Error(`No row values found for key ${pieRow.key}`);
    }

    return {
      ...pieRow,
      value,
    };
  });
  const visiblePieRows = pieRowsWithValues.filter(row =>
    row.isOther
      ? !hiddenSlices.includes(OTHER_SLICE_KEY)
      : !hiddenSlices.includes(row.key),
  );

  const total = visiblePieRows.reduce((currTotal, { value }) => {
    if (value < 0) {
      showWarning?.(pieNegativesWarning().text);
      return currTotal;
    }

    return currTotal + value;
  }, 0);

  // Create sliceTree, fill out the innermost slice ring
  const sliceTree: SliceTree = new Map();
  const [sliceTreeNodes, others] = _.chain(pieRowsWithValues)
    .map(({ value, color, key, name, isOther }, index) => {
      const visible = isOther
        ? !hiddenSlices.includes(OTHER_SLICE_KEY)
        : !hiddenSlices.includes(key);

      return {
        key,
        name,
        value,
        displayValue: value,
        normalizedPercentage: visible ? value / total : 0, // slice percentage values are normalized to 0-1 scale
        color: getColorForRing(
          color,
          "inner",
          colDescs.middleDimensionDesc != null,
          renderingContext,
        ),
        visible,
        children: new Map(),
        column: colDescs.dimensionDesc.column,
        rowIndex: checkNotNull(rowIndiciesByKey.get(key)),
        legendHoverIndex: index,
        isOther,
        includeInLegend: true,
        startAngle: 0, // placeholders
        endAngle: 0,
      };
    })
    .filter(slice => slice.value > 0)
    .partition(slice => slice != null && !slice.isOther)
    .value();

  // We don't show the grey other slice if there isn't more than one slice to
  // group into it
  if (others.length === 1) {
    const singleOtherSlice = others.pop();
    sliceTreeNodes.push(checkNotNull(singleOtherSlice));
  }

  sliceTreeNodes.forEach(node => {
    // Map key needs to be string, because we use it for lookup with values from
    // echarts, and echarts casts numbers to strings
    sliceTree.set(String(node.key), node);
  });

  // Iterate through non-aggregated rows from query result to build layers for
  // the middle and outer ring slices.
  if (colDescs.middleDimensionDesc != null) {
    const formatMiddleDimensionValue = getDimensionFormatter(
      settings,
      colDescs.middleDimensionDesc.column,
      renderingContext.formatValue,
    );

    const formatOuterDimensionValue =
      colDescs.outerDimensionDesc?.column != null
        ? getDimensionFormatter(
            settings,
            colDescs.outerDimensionDesc.column,
            renderingContext.formatValue,
          )
        : undefined;

    dataRows.forEach((row, index) => {
      // Needed to tell typescript it's defined
      if (colDescs.middleDimensionDesc == null) {
        throw new Error(`Missing middleDimensionDesc`);
      }

      const dimensionKey = getKeyFromDimensionValue(
        row[colDescs.dimensionDesc.index],
      );
      const dimensionNode = sliceTree.get(String(dimensionKey));
      const dimensionIsOther = dimensionNode == null;
      if (dimensionIsOther) {
        return;
      }
      const metricValue = getNumberOr(row[colDescs.metricDesc.index], 0);
      if (metricValue < 0) {
        return;
      }

      // Create or update node for middle dimension
      const middleDimensionKey = getKeyFromDimensionValue(
        row[colDescs.middleDimensionDesc.index],
      );
      let middleDimensionNode = dimensionNode.children.get(
        String(middleDimensionKey),
      );

      if (middleDimensionNode == null) {
        // If there is no node for this middle dimension value in the tree
        // create it.
        const normalizedPercentage = metricValue / total;
        const isOther =
          normalizedPercentage < (settings["pie.slice_threshold"] ?? 0) / 100;

        middleDimensionNode = {
          key: middleDimensionKey,
          name: formatMiddleDimensionValue(
            row[colDescs.middleDimensionDesc.index],
          ),
          value: metricValue,
          displayValue: metricValue,
          normalizedPercentage,
          color: getColorForRing(
            dimensionNode.color,
            "middle",
            true,
            renderingContext,
          ),
          visible: true,
          column: colDescs.middleDimensionDesc.column,
          rowIndex: index,
          isOther,
          children: new Map(),
          startAngle: 0,
          endAngle: 0,
        };
        dimensionNode.children.set(
          String(middleDimensionKey),
          middleDimensionNode,
        );
      } else {
        // If the node already exists, add the metric value from the current row
        // to it.
        middleDimensionNode.value += metricValue;
        middleDimensionNode.displayValue += metricValue;

        const normalizedPercentage = middleDimensionNode.value / total;
        const isOther =
          normalizedPercentage < (settings["pie.slice_threshold"] ?? 0) / 100;

        middleDimensionNode.normalizedPercentage = normalizedPercentage;
        middleDimensionNode.isOther = isOther;

        if (colDescs.outerDimensionDesc == null) {
          showWarning?.(
            unaggregatedDataWarningPie(colDescs.middleDimensionDesc.column)
              .text,
          );
        }
      }

      if (colDescs.outerDimensionDesc == null) {
        return;
      }
      // Create or update node for outer dimension
      const outerDimensionKey = getKeyFromDimensionValue(
        row[colDescs.outerDimensionDesc.index],
      );

      let outerDimensionNode = middleDimensionNode.children.get(
        String(outerDimensionKey),
      );

      if (outerDimensionNode == null) {
        const normalizedPercentage = metricValue / total;
        const isOther =
          normalizedPercentage < (settings["pie.slice_threshold"] ?? 0) / 100;

        outerDimensionNode = {
          key: outerDimensionKey,
          name:
            formatOuterDimensionValue?.(
              row[colDescs.outerDimensionDesc.index],
            ) ?? "",
          value: metricValue,
          displayValue: metricValue,
          normalizedPercentage,
          color: getColorForRing(
            dimensionNode.color,
            "outer",
            true,
            renderingContext,
          ),
          visible: true,
          column: colDescs.outerDimensionDesc.column,
          rowIndex: index,
          isOther,
          children: new Map(),
          startAngle: 0,
          endAngle: 0,
        };
        middleDimensionNode.children.set(
          String(outerDimensionKey),
          outerDimensionNode,
        );
      } else {
        outerDimensionNode.value += metricValue;
        outerDimensionNode.displayValue += metricValue;

        const normalizedPercentage = outerDimensionNode.value / total;
        const isOther =
          normalizedPercentage < (settings["pie.slice_threshold"] ?? 0) / 100;

        outerDimensionNode.normalizedPercentage = normalizedPercentage;
        outerDimensionNode.isOther = isOther;

        showWarning?.(
          unaggregatedDataWarningPie(colDescs.outerDimensionDesc.column).text,
        );
      }
    });
  }

  // Only add "other" slice if there are slices below threshold with non-zero total
  const otherTotal = others.reduce((currTotal, o) => currTotal + o.value, 0);
  if (otherTotal > 0) {
    const children: SliceTree = new Map();
    others.forEach(node => {
      children.set(String(node.key), {
        ...node,
        color: "",
      });
    });
    const visible = !hiddenSlices.includes(OTHER_SLICE_KEY);

    sliceTree.set(OTHER_SLICE_KEY, {
      key: OTHER_SLICE_KEY,
      name: OTHER_SLICE_NAME,
      value: otherTotal,
      displayValue: otherTotal,
      normalizedPercentage: visible ? otherTotal / total : 0,
      color: renderingContext.getColor("text-light"),
      column: colDescs.dimensionDesc.column,
      visible,
      children,
      legendHoverIndex: sliceTree.size,
      includeInLegend: true,
      isOther: true,
      startAngle: 0,
      endAngle: 0,
    });
  }

  // Aggregate slices in middle and outer ring into "other" slices
  sliceTreeNodes.forEach(node =>
    aggregateSlices(node, total, renderingContext),
  );

  // We increase the size of small slices, but only for the first ring, because
  // if we do this for the outer rings, it can lead to overlapping slices.
  sliceTree.forEach(slice => {
    if (slice.normalizedPercentage < OTHER_SLICE_MIN_PERCENTAGE) {
      slice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
    }
  });

  // We need start and end angles for the label formatter, to determine if we
  // should the percent label on the chart for a specific slice. To get these we
  // need to use d3.
  computeSliceAngles(getArrayFromMapValues(sliceTree));

  // If there are no non-zero slices, we'll display a single "other" slice
  if (sliceTree.size === 0) {
    sliceTree.set(OTHER_SLICE_KEY, {
      key: OTHER_SLICE_KEY,
      name: OTHER_SLICE_NAME,
      value: 1,
      displayValue: 0,
      normalizedPercentage: 0,
      color: renderingContext.getColor("text-light"),
      visible: true,
      column: colDescs.dimensionDesc.column,
      children: new Map(),
      legendHoverIndex: 0,
      isOther: true,
      noHover: true,
      includeInLegend: false,
      startAngle: 0,
      endAngle: 2 * Math.PI,
    });
  }

  const numRings = Math.max(
    ...getArrayFromMapValues(sliceTree).map(node => countNumRings(node)),
  );

  return {
    sliceTree,
    numRings,
    total,
    colDescs,
  };
}
