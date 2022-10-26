import React from "react";
import { Group } from "@visx/group";
import { Text } from "metabase/static-viz/components/Text";
import { LEGEND_CIRCLE_MARGIN_RIGHT, LEGEND_CIRCLE_SIZE } from "./constants";
import { PositionedLegendItem } from "./types";

const FONT_WEIGHT = 700;

type LegendItemProps = {
  item: PositionedLegendItem;
  fontSize: number;
  lineHeight: number;
};

export const LegendItem = ({ item, fontSize, lineHeight }: LegendItemProps) => {
  const { name, color, left, top } = item;
  const radius = LEGEND_CIRCLE_SIZE / 2;
  const textX = LEGEND_CIRCLE_SIZE + LEGEND_CIRCLE_MARGIN_RIGHT;

  return (
    <Group left={left} top={top}>
      <circle fill={color} r={radius} cx={radius} cy={radius} />
      <Text
        textAnchor="start"
        verticalAnchor="start"
        x={textX}
        fontWeight={FONT_WEIGHT}
        lineHeight={lineHeight}
        fontSize={fontSize}
      >
        {name}
      </Text>
    </Group>
  );
};
