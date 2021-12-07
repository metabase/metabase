import React from "react";
import { Group } from "@visx/group";
import { Text } from "metabase/static-viz/components/Text";
import {
  LEGEND_CIRCLE_SIZE,
  LEGEND_TEXT_MARGIN,
} from "metabase/static-viz/components/XYChart/constants";

type LegendItemProps = {
  label: string;
  color: string;
  top?: number;
  left?: number;
  width: number;
  textWidth: number;
  align?: "left" | "right";
};

export const LegendItem = ({
  label,
  color,
  left,
  top,
  width,
  textWidth,
  align = "left",
}: LegendItemProps) => {
  const radius = LEGEND_CIRCLE_SIZE / 2;
  const textAnchor = align === "left" ? "start" : "end";
  const textX = align === "left" ? LEGEND_TEXT_MARGIN : -LEGEND_TEXT_MARGIN;
  const circleCX = align === "left" ? radius : -radius;

  return (
    <Group left={left} top={top} width={width}>
      <circle fill={color} r={radius} cx={circleCX} cy={radius} />
      <Text
        textAnchor={textAnchor}
        verticalAnchor="start"
        width={textWidth}
        x={textX}
        fontWeight={700}
        fontSize={13}
      >
        {label}
      </Text>
    </Group>
  );
};
