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

/**
 * Resolve a path-encoded series node id (the ids set in `option.ts`: "0",
 * "0-1") to the chain of tree nodes along that path:
 * `"0"` → `[tree[0]]`, `"0-1"` → `[tree[0], tree[0].children[1]]`. The first
 * element is always the top-level grouping node; the last is the clicked node.
 * Returns `null` if any path segment is out of range. Used to build a
 * drill-through `ClickObject` from a clicked tile (see `TreemapChart/events.ts`).
 */
export function getTreemapNodePath(
  tree: TreemapTree,
  id: string,
): TreemapNode[] | null {
  const path: TreemapNode[] = [];
  let nodes: TreemapTree | undefined = tree;
  for (const segment of id.split("-")) {
    const index = Number(segment);
    const node: TreemapNode | undefined = Number.isInteger(index)
      ? nodes?.[index]
      : undefined;
    if (node == null) {
      return null;
    }
    path.push(node);
    nodes = node.children;
  }
  return path;
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
