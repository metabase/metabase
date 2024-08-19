import * as d3 from "d3";
import { useMemo } from "react";

import { Sparkline, type SparklineProps, type Datapoint } from "./Sparkline";

export type BinnedSparklineProps = SparklineProps & {
  limit?: number;
};

export function BinnedSparkline({
  limit = 30,
  data,
  ...rest
}: BinnedSparklineProps) {
  const binned = useMemo(() => {
    if (data.length < limit) {
      return data;
    }

    const bin = d3.bin<Datapoint, number>().value(x).thresholds(limit);

    const binned = bin(data);
    return binned
      .map(bin => ({
        x: bin[0].x,
        y: d3.median(bin.map(y)),
      }))
      .filter((d): d is Datapoint => d.y !== undefined);
  }, [data, limit]);

  return <Sparkline {...rest} data={binned} />;
}

function x(point: Datapoint): number {
  return point.x;
}

function y(point: Datapoint): number {
  return point.y ?? 0;
}
