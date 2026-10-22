import { Group } from "@visx/group";
import Color from "color";

import { Text } from "metabase/static-viz/components/Text";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { color as getColor } from "metabase/ui/colors";
import { truncateText } from "metabase/viz-core";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
} from "./constants";
import type { PositionedLegendItem } from "./types";

type LegendProps = {
  top?: number;
  left?: number;
  fontSize?: number;
  fontWeight?: number;
  legendItemMarginRight?: number;
  items: PositionedLegendItem[];
};

export const Legend = ({
  top,
  left,
  fontSize = DEFAULT_LEGEND_FONT_SIZE,
  fontWeight = DEFAULT_LEGEND_FONT_WEIGHT,
  legendItemMarginRight = LEGEND_ITEM_MARGIN_RIGHT,
  items,
}: LegendProps) => {
  const markerBorder = Color(getColor("shadow-default"));

  return (
    <Group left={left} top={top}>
      {items.map((item, index) => {
        const { name: originalName, color, left, top, width, percent } = item;

        const textX = LEGEND_CIRCLE_SIZE + LEGEND_CIRCLE_MARGIN_RIGHT;

        const percentTextWidth =
          percent != null ? measureTextWidth(percent, fontSize, fontWeight) : 0;

        let name =
          width != null
            ? truncateText(
                originalName,
                width -
                  percentTextWidth -
                  LEGEND_CIRCLE_SIZE -
                  LEGEND_CIRCLE_MARGIN_RIGHT -
                  legendItemMarginRight,
                (text, style) =>
                  measureTextWidth(
                    text,
                    Number(style.size),
                    Number(style.weight),
                  ),
                { size: fontSize, weight: fontWeight, family: "Lato" },
              )
            : originalName;

        // If `width` is present, the items are aligned in a grid, so we should
        // right justify the percent text at the end of the column. If `width`
        // is not present then there is no grid layout, and we render the
        // percent with the name, separated by a dash.
        let percentX;
        if (percent != null && width != null) {
          percentX = width - percentTextWidth - legendItemMarginRight;
        } else if (percent != null) {
          name = `${name} - ${percent}`;
        }

        return (
          <Group left={left} top={top} key={index}>
            <rect
              x={0.25}
              y={0.25}
              width={LEGEND_CIRCLE_SIZE - 0.5}
              height={LEGEND_CIRCLE_SIZE - 0.5}
              rx={LEGEND_CIRCLE_SIZE * 0.32}
              fill={color}
              stroke={markerBorder.hex()}
              strokeOpacity={markerBorder.alpha()}
              strokeWidth={0.5}
            />
            <Text
              textAnchor="start"
              verticalAnchor="start"
              x={textX}
              fontWeight={fontWeight}
              fontSize={fontSize}
            >
              {name}
            </Text>
            {percentX != null && (
              <Text
                textAnchor="start"
                verticalAnchor="start"
                x={percentX}
                fontWeight={fontWeight}
                fontSize={fontSize}
              >
                {percent}
              </Text>
            )}
          </Group>
        );
      })}
    </Group>
  );
};
