import { Group } from "@visx/group";
import React from "react";
import { LegendItem } from "./LegendItem";

type LegendItem = {
  top: number;
  label: string;
  color: string;
};

type LegendProps = {
  legend: {
    leftItems?: LegendItem[]
    rightItems?: LegendItem[]
    columnWidth: number,
    maxTextWidth: number,
  }
  width: number;
  top: number;
  left: number;
};

export const Legend = ({ legend, top, left, width }: LegendProps) => {
  const { leftItems, rightItems, columnWidth, maxTextWidth } = legend

  return (
    <Group left={left} top={top}>
      <Group>
        {leftItems?.map(item => {
          return (
            <LegendItem
              key={item.label}
              top={item.top}
              align="left"
              width={columnWidth}
              textWidth={maxTextWidth}
              label={item.label}
              color={item.color}
            />
          );
        })}
      </Group>

      <Group left={width}>
        {rightItems?.map(item => {
          return (
            <LegendItem
              key={item.label}
              top={item.top}
              align="right"
              width={columnWidth}
              textWidth={maxTextWidth}
              label={item.label}
              color={item.color}
            />
          );
        })}
      </Group>
    </Group>
  );
};
