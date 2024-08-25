import { checkNotNull } from "metabase/lib/types";

import { OPTION_NAME_SEPERATOR } from "../constants";
import type { PieChartModel, SliceTree, SliceTreeNode } from "../model/types";
import type { EChartsSunburstSeriesMouseEvent } from "../types";

export const getSliceKeyPath = (event: EChartsSunburstSeriesMouseEvent) =>
  event?.name?.split(OPTION_NAME_SEPERATOR) ?? [];

export function getSliceTreeNodesFromPath(
  sliceTree: SliceTree,
  path: string[],
) {
  let sliceTreeNode: SliceTreeNode | undefined = undefined;
  const nodes: SliceTreeNode[] = [];

  for (const key of path) {
    const currentSliceTree: SliceTree =
      sliceTreeNode == null ? sliceTree : sliceTreeNode.children;

    sliceTreeNode = checkNotNull(currentSliceTree.get(key));
    nodes.push(sliceTreeNode);
  }

  return { sliceTreeNode: checkNotNull(sliceTreeNode), nodes };
}

export const getInnerRingSlices = (chartModel: PieChartModel) =>
  Array(...chartModel.sliceTree.values());
