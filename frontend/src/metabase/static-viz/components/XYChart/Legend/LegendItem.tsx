import React from "react";
import { Group } from "@visx/group";
import { Text } from "metabase/static-viz/components/Text";
import {
  LEGEND_CIRCLE_SIZE,
  LEGEND_COLUMNS_MARGIN,
  LEGEND_TEXT_MARGIN,
} from "metabase/static-viz/components/XYChart/constants";
import { truncateText } from "metabase/static-viz/lib/text";

const FONT_WEIGHT = 700;

type LegendItemProps = {
  label: string;
  color: string;
  top?: number;
  left?: number;
  width: number;
  align?: "left" | "right";
  fontSize: number;
  lineHeight: number;
};

export const LegendItem = ({
  label,
  color,
  left,
  top,
  width,
  fontSize,
  lineHeight,
  align = "left",
}: LegendItemProps) => {
  const radius = LEGEND_CIRCLE_SIZE / 2;
  const textAnchor = align === "left" ? "start" : "end";
  const textX = align === "left" ? LEGEND_TEXT_MARGIN : -LEGEND_TEXT_MARGIN;
  const circleCX = align === "left" ? radius : -radius;
  const truncatedLabel = truncateText(
    label,
    width - LEGEND_TEXT_MARGIN - LEGEND_COLUMNS_MARGIN,
    fontSize,
    FONT_WEIGHT,
  );

  return (
    <Group left={left} top={top} width={width}>
      <circle fill={color} r={radius} cx={circleCX} cy={radius} />
      <Text
        textAnchor={textAnchor}
        verticalAnchor="start"
        x={textX}
        fontWeight={FONT_WEIGHT}
        lineHeight={lineHeight}
        fontSize={fontSize}
      >
        {truncatedLabel}
      </Text>
    </Group>
  );
};
