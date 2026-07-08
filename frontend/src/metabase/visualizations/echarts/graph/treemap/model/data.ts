import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import { getKeyFromDimensionValue } from "metabase/visualizations/shared/settings/pie";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  TreemapRow,
} from "metabase-types/api";

import { getTreemapColumnFormatter } from "./formatters";
import type { TreemapChartColumns, TreemapNode, TreemapTree } from "./types";

/**
 * The stable settings key for a top-level node — the same key `treemap.rows`
 * entries use, so colors and custom names resolve across data changes.
 */
export function getTreemapNodeKey(node: TreemapNode): string {
  return getKeyFromDimensionValue(node.rawName);
}

type TreemapSettingsColumns =
  | "treemap.grouping"
  | "treemap.sub_grouping"
  | "treemap.value";

export function getTreemapChartColumns<TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: Pick<ComputedVisualizationSettings, TreemapSettingsColumns>,
): TreemapChartColumns | null {
  const groupingColumnName = settings["treemap.grouping"];
  const valueColumnName = settings["treemap.value"];
  const subGroupingColumnName = settings["treemap.sub_grouping"];

  if (groupingColumnName == null || valueColumnName == null) {
    return null;
  }

  const grouping = getColumnDescriptors([groupingColumnName], columns)[0];
  const value = getColumnDescriptors([valueColumnName], columns)[0];

  if (!grouping?.column || !value?.column) {
    return null;
  }

  const subGroupingCandidate =
    subGroupingColumnName != null
      ? getColumnDescriptors([subGroupingColumnName], columns)[0]
      : undefined;

  return {
    grouping,
    subGrouping: subGroupingCandidate?.column
      ? subGroupingCandidate
      : undefined,
    value,
  };
}

export function getTreemapData(
  rawSeries: RawSeries,
  treemapColumns: TreemapChartColumns,
  treemapRows?: TreemapRow[],
  settings?: Pick<ComputedVisualizationSettings, "column">,
): TreemapTree {
  const [
    {
      data: { rows },
    },
  ] = rawSeries;
  const { grouping, subGrouping, value } = treemapColumns;
  const formatGroupingName = getTreemapColumnFormatter(
    grouping.column,
    settings,
  );
  const formatSubGroupingName =
    subGrouping != null
      ? getTreemapColumnFormatter(subGrouping.column, settings)
      : null;

  const rowNameByKey = new Map<string, string>(
    (treemapRows ?? []).map((row) => [row.key, row.name]),
  );

  const userDisabledRows = new Set(
    (treemapRows ?? [])
      .filter((row) => row.enabled === false)
      .map((row) => row.key),
  );

  const rootByKey = new Map<RowValue, TreemapNode>();
  const leafMapByRoot = new Map<TreemapNode, Map<RowValue, TreemapNode>>();

  rows.forEach((row, rowIndex) => {
    const groupingValue = row[grouping.index];
    const metricValue = row[value.index];

    if (userDisabledRows.has(getKeyFromDimensionValue(groupingValue))) {
      return;
    }

    const { node: rootNode } = getOrCreateNode({
      map: rootByKey,
      rawName: groupingValue,
      displayName:
        rowNameByKey.get(getKeyFromDimensionValue(groupingValue)) ??
        formatGroupingName(groupingValue),
      withChildren: subGrouping != null,
    });
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
    const { node: leaf, wasCreated } = getOrCreateNode({
      map: leafMap,
      rawName: subGroupingValue,
      displayName:
        formatSubGroupingName?.(subGroupingValue) ?? NULL_DISPLAY_VALUE,
      withChildren: false,
    });
    addRowMetric(leaf, metricValue, rowIndex);
    if (wasCreated) {
      rootNode.children?.push(leaf);
    }
  });

  return Array.from(rootByKey.values());
}

function getOrCreateNode({
  map,
  rawName,
  displayName,
  withChildren,
}: {
  map: Map<RowValue, TreemapNode>;
  rawName: RowValue;
  displayName: string;
  withChildren: boolean;
}): { node: TreemapNode; wasCreated: boolean } {
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
