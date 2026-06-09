import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";

import {
  getTreemapTooltipContext,
  getTreemapTooltipModel,
} from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";

export function getTreemapTooltipOption(
  tree: TreemapTree,
  colors: Record<string, string>,
  formatValue: (value: number) => string,
  containerRef: React.RefObject<HTMLDivElement>,
  getViewRootId: () => string | null,
  inlineValuePercentIds: Set<string>,
  groupingHeader?: string,
): TooltipOption {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: (params) => {
      if (Array.isArray(params)) {
        return "";
      }
      const id = (params.data as { id?: string } | undefined)?.id;
      if (id == null) {
        return "";
      }
      // Tiles that already show their value + percentage inline don't need a
      // tooltip — suppress it so only smaller (label-only / unlabeled) tiles
      // surface the breakdown on hover.
      if (inlineValuePercentIds.has(id)) {
        return "";
      }
      const context = getTreemapTooltipContext(
        tree,
        id,
        getViewRootId(),
        groupingHeader,
      );
      if (context == null) {
        return "";
      }

      // In the drilled-in sub-group view every sibling shares the parent's
      // color, so per-row markers would be identical and redundant — omit them.
      // In the overview each top-level group keeps its own color.
      const getColor = (node: TreemapNode) =>
        context.parentNode ? undefined : colors[String(node.rawName)];

      return reactNodeToHtmlString(
        <EChartsTooltip
          {...getTreemapTooltipModel(context, getColor, formatValue)}
        />,
      );
    },
  };
}
