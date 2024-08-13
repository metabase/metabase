import { Group } from "@visx/group";

import { Text } from "metabase/static-viz/components/Text";
import { measureTextWidth, truncateText } from "metabase/static-viz/lib/text";

import {
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
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
  return (
    <Group left={left} top={top}>
      {items.map((item, index) => {
        const { name: originalName, color, left, top, width, percent } = item;

        const radius = LEGEND_CIRCLE_SIZE / 2;
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
                fontSize,
                fontWeight,
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
            <circle fill={color} r={radius} cx={radius} cy={radius} />
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
