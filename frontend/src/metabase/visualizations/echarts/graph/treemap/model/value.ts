import { formatPercent } from "metabase/static-viz/lib/numbers";

import type { TreemapTree } from "./types";

export function getTreemapTotal(tree: TreemapTree) {
  return tree.reduce((sum, node) => sum + node.value, 0);
}

export function getLeafPercentLabel({
  isDrilled,
  value,
  parentValue,
  formatPercentOfTotal,
}: {
  isDrilled: boolean;
  value: number;
  parentValue?: number;
  formatPercentOfTotal: (value: number) => string;
}): string {
  if (!isDrilled || parentValue == null) {
    return formatPercentOfTotal(value);
  }

  return formatPercent(parentValue === 0 ? 0 : value / parentValue);
}
