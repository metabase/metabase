import { Group } from "@visx/group";

import { Text } from "metabase/static-viz/components/Text";

import {
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
} from "./constants";
import type { PositionedLegendItem } from "./types";

type LegendProps = {
  top?: number;
  left?: number;
  fontSize?: number;
  fontWeight?: number;
  items: PositionedLegendItem[];
};

export const Legend = ({
  top,
  left,
  fontSize = DEFAULT_LEGEND_FONT_SIZE,
  fontWeight = DEFAULT_LEGEND_FONT_WEIGHT,
  items,
}: LegendProps) => {
  return (
    <Group left={left} top={top}>
      {items.map((item, index) => {
        const { name, color, left, top } = item;
        const radius = LEGEND_CIRCLE_SIZE / 2;
        const textX = LEGEND_CIRCLE_SIZE + LEGEND_CIRCLE_MARGIN_RIGHT;

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
          </Group>
        );
      })}
    </Group>
  );
};
