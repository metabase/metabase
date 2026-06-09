import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";

import {
  type TreemapInlineValueIds,
  getTreemapTooltipContext,
  getTreemapTooltipModel,
  isTreemapTooltipSuppressed,
} from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";

export function getTreemapTooltipOption(
  tree: TreemapTree,
  colors: Record<string, string>,
  formatValue: (value: number) => string,
  containerRef: React.RefObject<HTMLDivElement>,
  getViewRootId: () => string | null,
  inlineValueIds: TreemapInlineValueIds,
  groupingHeader?: string,
): TooltipOption {
  const isTwoLevel = tree.some((node) => node.children != null);
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
      const viewRootId = getViewRootId();
      // When the same value + percentage is already on the canvas, the tooltip
      // is redundant — suppress it (see `isTreemapTooltipSuppressed` for the
      // view-dependent rule: group header at the overview, the tile itself when
      // drilled or 1-level).
      if (
        isTreemapTooltipSuppressed(id, viewRootId, isTwoLevel, inlineValueIds)
      ) {
        return "";
      }
      const context = getTreemapTooltipContext(
        tree,
        id,
        viewRootId,
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
