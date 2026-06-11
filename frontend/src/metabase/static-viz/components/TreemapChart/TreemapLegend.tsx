import { Group } from "@visx/group";

import { Text } from "metabase/static-viz/components/Text";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { truncateText } from "metabase/visualizations/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  TREEMAP_LEGEND_DOT_GAP,
  TREEMAP_LEGEND_DOT_SIZE,
  TREEMAP_LEGEND_FONT_SIZE,
  TREEMAP_LEGEND_INDENT,
  TREEMAP_LEGEND_NAME_CLUSTER_GAP,
  TREEMAP_LEGEND_PERCENT_WIDTH,
  TREEMAP_LEGEND_ROW_HEIGHT,
  TREEMAP_LEGEND_TOTAL_PADDING_TOP,
  TREEMAP_LEGEND_VALUE_PERCENT_GAP,
  TREEMAP_LEGEND_VALUE_WIDTH,
  TREEMAP_LEGEND_WIDTH,
  type TreemapLegendModel,
  type TreemapLegendRow,
} from "./legend";

const FONT_WEIGHT_REGULAR = 400;
const FONT_WEIGHT_BOLD = 700;

type TreemapLegendProps = {
  model: TreemapLegendModel;
  left?: number;
  top?: number;
  width?: number;
  renderingContext: RenderingContext;
};

/**
 * The static treemap's legend column: per-group rows (bold parent with a color
 * dot, indented regular leaves) — or a flat list for a 1-level treemap — with
 * right-aligned value and percent columns, closed by a Total row above a
 * separator line. Layout (row positions, height) comes from the model; this
 * component only draws it.
 */
export function TreemapLegend({
  model,
  left,
  top,
  width = TREEMAP_LEGEND_WIDTH,
  renderingContext,
}: TreemapLegendProps) {
  const { getColor } = renderingContext;
  const valueRight =
    width - TREEMAP_LEGEND_PERCENT_WIDTH - TREEMAP_LEGEND_VALUE_PERCENT_GAP;

  return (
    <Group left={left} top={top}>
      {model.rows.map((row, index) => {
        const fontWeight =
          row.type === "leaf" ? FONT_WEIGHT_REGULAR : FONT_WEIGHT_BOLD;
        const indent = row.indent ? TREEMAP_LEGEND_INDENT : 0;
        const nameX =
          indent +
          (row.color != null
            ? TREEMAP_LEGEND_DOT_SIZE + TREEMAP_LEGEND_DOT_GAP
            : 0);
        const name = truncateName(row, width - nameX);

        return (
          <Group key={index} top={row.top}>
            {row.type === "total" && (
              <line
                data-testid="legend-separator"
                x1={0}
                x2={width}
                y1={-TREEMAP_LEGEND_TOTAL_PADDING_TOP}
                y2={-TREEMAP_LEGEND_TOTAL_PADDING_TOP}
                stroke={getColor("border")}
              />
            )}
            {row.color != null && (
              <circle
                data-testid="legend-dot"
                cx={indent + TREEMAP_LEGEND_DOT_SIZE / 2}
                cy={TREEMAP_LEGEND_ROW_HEIGHT / 2}
                r={TREEMAP_LEGEND_DOT_SIZE / 2}
                fill={row.color}
              />
            )}
            <Text
              data-testid="legend-name"
              x={nameX}
              y={TREEMAP_LEGEND_ROW_HEIGHT / 2}
              verticalAnchor="middle"
              fontSize={TREEMAP_LEGEND_FONT_SIZE}
              fontWeight={fontWeight}
              fill={getColor("text-primary")}
            >
              {name}
            </Text>
            <Text
              x={valueRight}
              y={TREEMAP_LEGEND_ROW_HEIGHT / 2}
              textAnchor="end"
              verticalAnchor="middle"
              fontSize={TREEMAP_LEGEND_FONT_SIZE}
              fontWeight={fontWeight}
              fill={getColor("text-primary")}
            >
              {row.valueLabel}
            </Text>
            <Text
              x={width}
              y={TREEMAP_LEGEND_ROW_HEIGHT / 2}
              textAnchor="end"
              verticalAnchor="middle"
              fontSize={TREEMAP_LEGEND_FONT_SIZE}
              fontWeight={fontWeight}
              fill={getColor("text-secondary")}
            >
              {row.percentLabel}
            </Text>
          </Group>
        );
      })}
    </Group>
  );
}

function truncateName(row: TreemapLegendRow, availableFromNameX: number) {
  const fontWeight =
    row.type === "leaf" ? FONT_WEIGHT_REGULAR : FONT_WEIGHT_BOLD;
  const nameMaxWidth =
    availableFromNameX -
    TREEMAP_LEGEND_NAME_CLUSTER_GAP -
    TREEMAP_LEGEND_VALUE_WIDTH -
    TREEMAP_LEGEND_VALUE_PERCENT_GAP -
    TREEMAP_LEGEND_PERCENT_WIDTH;

  return truncateText(
    row.name,
    nameMaxWidth,
    (text, style) =>
      measureTextWidth(text, Number(style.size), Number(style.weight)),
    {
      size: TREEMAP_LEGEND_FONT_SIZE,
      weight: fontWeight,
      family: "Lato",
    },
  );
}
