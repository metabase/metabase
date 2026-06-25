import visualizations from "metabase/visualizations";
import type { CardDisplayType, IconName } from "metabase-types/api";

// Default visualization can be any sensible visualization, so the
// chart type picker needs to be able to show any icon.
const MCP_CHART_TYPE_ICONS: Record<CardDisplayType, IconName> = {
  area: "area",
  bar: "bar",
  boxplot: "boxplot",
  combo: "lineandbar",
  funnel: "funnel",
  gauge: "gauge",
  line: "line",
  map: "pinmap",
  object: "document",
  pie: "pie",
  pivot: "pivot_table",
  progress: "progress",
  row: "horizontal_bar",
  sankey: "sankey",
  scalar: "number",
  scatter: "bubble",
  smartscalar: "smartscalar",
  table: "table2",
  treemap: "treemap",
  waterfall: "waterfall",
  list: "table2",
};

// Chart types that can be the alternative.
const MCP_ALTERNATIVE_CHART_TYPES: CardDisplayType[] = ["bar", "line"];

export type McpChartTypeEntry = {
  type: CardDisplayType;
  icon: IconName;
};

interface GetMcpChartTypesProps {
  defaultDisplay: CardDisplayType | null;
  sensibleVisualizations: CardDisplayType[];
  canShowTable: boolean;
}

function getChartTypeIcon(type: CardDisplayType) {
  const visualization = visualizations.get(type);

  return visualization?.iconName ?? MCP_CHART_TYPE_ICONS[type] ?? null;
}

export function getMcpChartTypes({
  defaultDisplay,
  sensibleVisualizations,
  canShowTable,
}: GetMcpChartTypesProps): McpChartTypeEntry[] {
  const candidates = MCP_ALTERNATIVE_CHART_TYPES.filter(
    (type) => type !== defaultDisplay,
  );

  const chartTypes: Array<CardDisplayType | null> = [
    // Slot 1: the default visualization
    // Lets them go back to the default viz even if it's not bar/line/area.
    defaultDisplay,

    // Slot 2: sensible visualization that isn't already the default display
    candidates.find((type) => sensibleVisualizations.includes(type)) ?? null,

    // Slot 3: show table when it has enough data to be useful.
    canShowTable ? "table" : null,
  ];

  return Array.from(new Set(chartTypes))
    .map((type) => {
      if (!type) {
        return null;
      }

      const icon = getChartTypeIcon(type);

      if (!icon) {
        return null;
      }

      return { type, icon };
    })
    .filter((entry): entry is McpChartTypeEntry => entry != null);
}
