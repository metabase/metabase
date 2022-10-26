import React from "react";
import { Group } from "@visx/group";
import { LegendItem } from "./LegendItem";
import { PositionedLegendItem } from "./types";

type LegendProps = {
  top: number;
  width: number;
  left: number;
  lineHeight: number;
  fontSize: number;
  items: PositionedLegendItem[];
};

export const Legend = ({
  top,
  left,
  lineHeight,
  fontSize,
  items,
}: LegendProps) => {
  return (
    <Group left={left} top={top}>
      {items.map((item, index) => {
        return (
          <LegendItem
            key={index}
            item={item}
            fontSize={fontSize}
            lineHeight={lineHeight}
          />
        );
      })}
    </Group>
  );
};
