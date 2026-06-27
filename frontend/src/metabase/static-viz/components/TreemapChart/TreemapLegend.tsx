import { Group } from "@visx/group";

import { Text } from "metabase/static-viz/components/Text";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { truncateText } from "metabase/visualizations/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  DOT_GAP,
  DOT_RADIUS,
  DOT_SIZE,
  FONT_SIZE,
  INDENT,
  LEGEND_WIDTH,
  NAME_CLUSTER_GAP,
  PADDING_TOP,
  PERCENT_WIDTH,
  ROW_CENTER_Y,
  type TreemapLegendModel,
  type TreemapLegendRow,
  VALUE_PERCENT_GAP,
  VALUE_WIDTH,
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

export function TreemapLegend({
  model,
  left,
  top,
  width = LEGEND_WIDTH,
  renderingContext,
}: TreemapLegendProps) {
  const { getColor } = renderingContext;
  const valueRight = width - PERCENT_WIDTH - VALUE_PERCENT_GAP;

  return (
    <Group left={left} top={top}>
      {model.rows.map((row, index) => {
        const fontWeight = getRowFontWeight(row);
        const indent = row.indent ? INDENT : 0;
        const nameX =
          indent + (row.color !== undefined ? DOT_SIZE + DOT_GAP : 0);
        const name = truncateName(row, width - nameX);

        return (
          <Group key={index} top={row.top}>
            {row.type === "total" && (
              <line
                data-testid="legend-separator"
                x1={0}
                x2={width}
                y1={-PADDING_TOP}
                y2={-PADDING_TOP}
                stroke={getColor("border")}
              />
            )}
            {row.color !== undefined && (
              <circle
                data-testid="legend-dot"
                cx={indent + DOT_RADIUS}
                cy={ROW_CENTER_Y}
                r={DOT_RADIUS}
                fill={row.color}
              />
            )}
            <Text
              data-testid="legend-name"
              x={nameX}
              y={ROW_CENTER_Y}
              verticalAnchor="middle"
              fontSize={FONT_SIZE}
              fontWeight={fontWeight}
              fill={getColor("text-primary")}
            >
              {name}
            </Text>
            <Text
              x={valueRight}
              y={ROW_CENTER_Y}
              textAnchor="end"
              verticalAnchor="middle"
              fontSize={FONT_SIZE}
              fontWeight={fontWeight}
              fill={getColor("text-primary")}
            >
              {row.valueLabel}
            </Text>
            <Text
              x={width}
              y={ROW_CENTER_Y}
              textAnchor="end"
              verticalAnchor="middle"
              fontSize={FONT_SIZE}
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

function getRowFontWeight(row: TreemapLegendRow) {
  return row.type === "leaf" ? FONT_WEIGHT_REGULAR : FONT_WEIGHT_BOLD;
}

function truncateName(row: TreemapLegendRow, availableFromNameX: number) {
  const fontWeight = getRowFontWeight(row);
  const nameMaxWidth =
    availableFromNameX -
    NAME_CLUSTER_GAP -
    VALUE_WIDTH -
    VALUE_PERCENT_GAP -
    PERCENT_WIDTH;

  return truncateText(
    row.name,
    nameMaxWidth,
    (text, style) =>
      measureTextWidth(text, Number(style.size), Number(style.weight)),
    {
      size: FONT_SIZE,
      weight: fontWeight,
      family: "Lato",
    },
  );
}
