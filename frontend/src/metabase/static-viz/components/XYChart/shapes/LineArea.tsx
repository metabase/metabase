import React from "react";
import { Area, LinePath } from "@visx/shape";
import { AccessorForArrayItem, PositionScale } from "@visx/shape/lib/types";

interface AreaProps<Datum> {
  x: AccessorForArrayItem<Datum, number>;
  y: number | AccessorForArrayItem<Datum, number>;
  y1: number | AccessorForArrayItem<Datum, number>;
  yScale: PositionScale;
  data?: Datum[];
  color: string;
}

export const LineArea = <Datum,>({
  x,
  y,
  data,
  y1,
  color,
}: AreaProps<Datum>) => {
  return (
    <>
      <LinePath x={x} y={y} data={data} stroke={color} strokeWidth={2} />
      <Area x={x} y={y} y1={y1} data={data} fill={color} opacity={0.2} />
    </>
  );
};
