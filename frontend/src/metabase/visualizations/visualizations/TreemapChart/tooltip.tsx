import type { TooltipOption } from "echarts/types/dist/shared";
import _ from "underscore";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import {
  type TreemapInlineValueIds,
  getTreemapTooltipContext,
  getTreemapTooltipModel,
  isTreemapTooltipSuppressed,
} from "metabase/visualizations/echarts/graph/treemap/model/tooltip";
import type {
  TreemapNode,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";

const hasId = (value: unknown): value is { id: unknown } =>
  _.isObject(value) && "id" in value;

export function getTreemapTooltipOption(
  tree: TreemapTree,
  colors: Record<string, string>,
  formatValue: (value: number) => string,
  formatPercent: (ratio: number) => string,
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
      const id =
        hasId(params.data) && typeof params.data.id === "string"
          ? params.data.id
          : undefined;
      if (id == null) {
        return "";
      }
      const viewRootId = getViewRootId();
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

      const getColor = (node: TreemapNode) =>
        context.parentNode ? undefined : colors[getTreemapNodeKey(node)];

      return reactNodeToHtmlString(
        <EChartsTooltip
          {...getTreemapTooltipModel(
            context,
            getColor,
            formatValue,
            formatPercent,
          )}
        />,
      );
    },
  };
}
