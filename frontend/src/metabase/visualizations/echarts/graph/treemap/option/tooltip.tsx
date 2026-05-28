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
      const context = getTreemapTooltipContext(tree, id, groupingHeader);
      if (context == null) {
        return "";
      }

      const parentColor = context.parentNode
        ? colors[String(context.parentNode.rawName)]
        : undefined;
      const getColor = (node: TreemapNode) =>
        context.parentNode ? parentColor : colors[String(node.rawName)];

      return reactNodeToHtmlString(
        <EChartsTooltip
          {...getTreemapTooltipModel(context, getColor, formatValue)}
        />,
      );
    },
  };
}
