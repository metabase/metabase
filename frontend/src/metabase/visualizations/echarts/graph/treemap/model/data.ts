import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import type { TreemapChartColumns, TreemapNode, TreemapTree } from "./types";

type TreemapSettingsColumns =
  | "treemap.grouping"
  | "treemap.sub_grouping"
  | "treemap.value";

export function getTreemapChartColumns<TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: Pick<ComputedVisualizationSettings, TreemapSettingsColumns>,
): TreemapChartColumns | null {
  const groupingColumName = settings["treemap.grouping"];
  const valueColumnName = settings["treemap.value"];
  const subGroupingColumnName = settings["treemap.sub_grouping"];

  if (groupingColumName == null || valueColumnName == null) {
    return null;
  }

  const grouping = getColumnDescriptors([groupingColumName], columns)[0];
  const value = getColumnDescriptors([valueColumnName], columns)[0];

  if (!grouping?.column || !value?.column) {
    return null;
  }

  if (subGroupingColumnName != null) {
    const subGrouping = getColumnDescriptors(
      [subGroupingColumnName],
      columns,
    )[0];
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

  const rootByKey = new Map<RowValue, TreemapNode>();
  const leafMapByRoot = new Map<TreemapNode, Map<RowValue, TreemapNode>>();

  rows.forEach((row, rowIndex) => {
    const groupingValue = row[grouping.index];
    const metricValue = row[value.index];

    const { node: rootNode } = getOrCreateNode(
      rootByKey,
      groupingValue,
      groupingValue == null ? NULL_DISPLAY_VALUE : String(groupingValue),
      subGrouping != null,
    );
    addRowMetric(rootNode, metricValue, rowIndex);

    if (subGrouping == null) {
      return;
    }

    const subGroupingValue = row[subGrouping.index];
    let leafMap = leafMapByRoot.get(rootNode);
    if (leafMap == null) {
      leafMap = new Map();
      leafMapByRoot.set(rootNode, leafMap);
    }
    const { node: leaf, wasCreated } = getOrCreateNode(
      leafMap,
      subGroupingValue,
      subGroupingValue == null ? NULL_DISPLAY_VALUE : String(subGroupingValue),
      false,
    );
    addRowMetric(leaf, metricValue, rowIndex);
    if (wasCreated) {
      rootNode.children?.push(leaf);
    }
  });

  return Array.from(rootByKey.values());
}

function getOrCreateNode(
  map: Map<RowValue, TreemapNode>,
  rawName: RowValue,
  displayName: string,
  withChildren: boolean,
): { node: TreemapNode; wasCreated: boolean } {
  const existing = map.get(rawName);
  if (existing != null) {
    return { node: existing, wasCreated: false };
  }
  const node: TreemapNode = {
    rawName,
    displayName,
    value: 0,
    rowIndices: [],
    ...(withChildren ? { children: [] } : {}),
  };
  map.set(rawName, node);
  return { node, wasCreated: true };
}

function addRowMetric(
  node: TreemapNode,
  metricValue: RowValue,
  rowIndex: number,
): void {
  node.value = sumMetric(node.value, metricValue) ?? node.value;
  node.rowIndices.push(rowIndex);
}
