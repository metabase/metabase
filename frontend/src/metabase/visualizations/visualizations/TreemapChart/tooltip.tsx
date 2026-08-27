import type { EChartsType } from "echarts/core";
import type { TooltipOption } from "echarts/types/dist/shared";
import _ from "underscore";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import {
  type TreemapInlineValueIds,
  getTreemapTooltipContext,
  getTreemapTooltipModel,
  isGroupHeaderNode,
  isPointerBelowGroupHeader,
  isTreemapTooltipSuppressed,
} from "metabase/visualizations/echarts/graph/treemap/model/tooltip";
import { getTreemapNodeRectById } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  ChartPointer,
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
  getIsClicked: () => boolean,
  getIsAnimating: () => boolean,
  getChart: () => EChartsType | undefined,
  getPointer: () => ChartPointer | null,
  headerHeight: number,
  inlineValueIds: TreemapInlineValueIds,
  groupingHeader?: string,
): TooltipOption {
  const isTwoLevel = tree.some((node) => node.children != null);
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: (params) => {
      if (getIsClicked() || getIsAnimating()) {
        return "";
      }
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

      if (isGroupHeaderNode(id, viewRootId, isTwoLevel)) {
        const chart = getChart();
        const pointer = getPointer();
        const rect = chart ? getTreemapNodeRectById(chart, id) : null;
        if (
          rect == null ||
          pointer == null ||
          isPointerBelowGroupHeader(rect, pointer, headerHeight)
        ) {
          return "";
        }
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
