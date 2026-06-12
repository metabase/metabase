import { formatPercent } from "metabase/static-viz/lib/numbers";

import type { TreemapTree } from "./types";

export function getTreemapTotal(tree: TreemapTree) {
  return tree.reduce((sum, node) => sum + node.value, 0);
}

export function getTreemapPercentOfTotalFormatter(tree: TreemapTree) {
  const total = getTreemapTotal(tree);

  return (value: number) => formatPercent(total === 0 ? 0 : value / total);
}
