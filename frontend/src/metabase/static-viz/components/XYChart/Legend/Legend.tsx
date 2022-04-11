import React from "react";
import { Group } from "@visx/group";
import { LegendItem } from "./LegendItem";
import { LegendItemData } from "../utils";

type LegendProps = {
  leftColumn: LegendItemData[];
  rightColumn: LegendItemData[];
  top: number;
  width: number;
  padding: number;
  lineHeight: number;
  fontSize: number;
};

export const Legend = ({
  leftColumn,
  rightColumn,
  top,
  width,
  padding,
  lineHeight,
  fontSize,
}: LegendProps) => {
  const columnWidth = width / 2;
  const innerWidth = columnWidth - padding;

  return (
    <Group left={padding} top={top}>
      <Group>
        {leftColumn?.map((item, index) => {
          return (
            <LegendItem
              left={padding}
              key={index}
              top={index * lineHeight}
              align="left"
              width={rightColumn.length > 0 ? innerWidth : width}
              label={item.name}
              color={item.color}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          );
        })}
      </Group>

      <Group left={columnWidth}>
        {rightColumn?.map((item, index) => {
          return (
            <LegendItem
              key={index}
              top={index * lineHeight}
              align="right"
              left={columnWidth - padding * 2}
              width={leftColumn.length > 0 ? innerWidth : width}
              label={item.name}
              color={item.color}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          );
        })}
      </Group>
    </Group>
  );
};
