import React from "react";
import { Area, LinePath } from "@visx/shape";
import { AccessorForArrayItem, PositionScale } from "@visx/shape/lib/types";

// TODO: add generic types
interface AreaProps {
  x: AccessorForArrayItem<unknown, number>;
  y: AccessorForArrayItem<unknown, number>;
  y1: number;
  yScale: PositionScale;
  data: unknown[];
  color: string;
}

export const LineArea = ({ x, y, data, y1, color }: AreaProps) => {
  return (
    <>
      <LinePath x={x} y={y} data={data} stroke={color} strokeWidth={2} />
      <Area x={x} y={y} y1={y1} data={data} fill={color} opacity={0.2} />
    </>
  );
};
