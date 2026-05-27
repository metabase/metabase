import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import type { TreemapChartColumns, TreemapNode, TreemapTree } from "./types";

export function getTreemapChartColumns<TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: Pick<
    ComputedVisualizationSettings,
    "treemap.grouping" | "treemap.sub_grouping" | "treemap.value"
  >,
): TreemapChartColumns | null {
  if (
    settings["treemap.grouping"] == null ||
    settings["treemap.value"] == null
  ) {
    return null;
  }

  const grouping = getColumnDescriptors(
    [settings["treemap.grouping"]],
    columns,
  )[0];
  const value = getColumnDescriptors([settings["treemap.value"]], columns)[0];

  if (!grouping?.column || !value?.column) {
    return null;
  }

  const subGroupingSetting = settings["treemap.sub_grouping"];
  if (subGroupingSetting != null) {
    const subGrouping = getColumnDescriptors([subGroupingSetting], columns)[0];
    if (subGrouping?.column) {
      return { grouping, subGrouping, value };
    }
  }

  return { grouping, value };
}

export function getTreemapData(
  rawSeries: RawSeries,
  treemapColumns: TreemapChartColumns,
): TreemapTree {
  const [
    {
      data: { rows },
    },
  ] = rawSeries;
  const { grouping, subGrouping, value } = treemapColumns;

  if (subGrouping == null) {
    const nodeByKey = new Map<RowValue, TreemapNode>();

    rows.forEach((row, rowIndex) => {
      const groupingValue = row[grouping.index];
      const metricValue = row[value.index];

      const existing = nodeByKey.get(groupingValue);
      if (existing) {
        existing.value =
          sumMetric(existing.value, metricValue) ?? existing.value;
        existing.rowIndices.push(rowIndex);
      } else {
        nodeByKey.set(groupingValue, {
          rawName: groupingValue,
          displayName: String(groupingValue ?? ""),
          value: sumMetric(0, metricValue) ?? 0,
          rowIndices: [rowIndex],
        });
      }
    });

    return Array.from(nodeByKey.values());
  }

  type RootEntry = {
    node: TreemapNode;
    leafByKey: Map<RowValue, TreemapNode>;
  };
  const rootByKey = new Map<RowValue, RootEntry>();

  rows.forEach((row, rowIndex) => {
    const groupingValue = row[grouping.index];
    const subGroupingValue = row[subGrouping.index];
    const metricValue = row[value.index];

    let rootEntry = rootByKey.get(groupingValue);
    if (!rootEntry) {
      const rootNode: TreemapNode = {
        rawName: groupingValue,
        displayName: String(groupingValue ?? ""),
        value: 0,
        rowIndices: [],
        children: [],
      };
      rootEntry = { node: rootNode, leafByKey: new Map() };
      rootByKey.set(groupingValue, rootEntry);
    }

    const { node: rootNode, leafByKey } = rootEntry;

    const existingLeaf = leafByKey.get(subGroupingValue);
    if (existingLeaf) {
      existingLeaf.value =
        sumMetric(existingLeaf.value, metricValue) ?? existingLeaf.value;
      existingLeaf.rowIndices.push(rowIndex);
    } else {
      const newLeaf: TreemapNode = {
        rawName: subGroupingValue,
        displayName:
          subGroupingValue == null
            ? NULL_DISPLAY_VALUE
            : String(subGroupingValue),
        value: sumMetric(0, metricValue) ?? 0,
        rowIndices: [rowIndex],
      };
      leafByKey.set(subGroupingValue, newLeaf);
      rootNode.children?.push(newLeaf);
    }

    rootNode.value = sumMetric(rootNode.value, metricValue) ?? rootNode.value;
    rootNode.rowIndices.push(rowIndex);
  });

  return Array.from(rootByKey.values()).map((entry) => entry.node);
}
