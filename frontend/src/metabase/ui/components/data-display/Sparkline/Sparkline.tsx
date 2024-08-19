import { curveLinear } from "@visx/curve";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { extent, ascending } from "@visx/vendor/d3-array";
import { useMemo } from "react";

type Datapoint = {
  x: Date | string;
  y: number;
};

type Props = {
  color?: string;
  className?: string;
  data: Datapoint[];
  height: number;
  width: number;
};

const STROKE_WIDTH = 2;
const PADDING = STROKE_WIDTH;

export function Sparkline({
  className,
  data = [],
  width,
  height,
  color = "var(--mb-color-brand)",
}: Props) {
  const { xScale, yScale } = useMemo(() => {
    const sorted = data.sort((a, b) => ascending(x(a), x(b)));
    const xScale = scaleTime<number>({
      domain: extent(sorted, x) as [Date, Date],
      range: [0 + PADDING, width - PADDING],
    });
    const yScale = scaleLinear<number>({
      domain: extent(sorted, y) as [number, number],
      range: [height - PADDING, PADDING],
    });

    return { xScale, yScale };
  }, [data, width, height]);

  return (
    <svg width={width} height={height} className={className} role="img">
      {xScale && yScale && (
        <LinePath<Datapoint>
          curve={curveLinear}
          data={data}
          x={d => xScale(x(d))}
          y={d => yScale(y(d)) ?? 0}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="butt"
          shapeRendering="geometricPrecision"
        />
      )}
    </svg>
  );
}

function x(point: Datapoint): Date {
  return new Date(point.x);
}

function y(point: Datapoint): number {
  return point.y;
}
