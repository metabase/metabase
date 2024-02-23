import type { TextProps } from "@visx/text";

import { measureTextWidth } from "metabase/static-viz/lib/text";

import type { HydratedSeries } from "../types";

import { getY } from "./series";

// Use the same logic as in https://github.com/metabase/metabase/blob/72d23d2b8e5a1f93b288e5a8738758c9b05d3766/frontend/src/metabase/visualizations/lib/chart_values.js#L318
export function getValueStep(
  multipleSeries: HydratedSeries[],
  seriesIndex: number,
  valueFormatter: (value: number) => string,
  valueProps: Partial<TextProps>,
  chartWidth: number,
) {
  if (multipleSeries.length === 0) {
    return 1;
  }
  const maxSeriesLength = Math.max(
    ...multipleSeries.map(series => series.data.length),
  );
  const LABEL_PADDING = 6;
  const MAX_SAMPLE_SIZE = 30;
  const sampleStep = Math.ceil(maxSeriesLength / MAX_SAMPLE_SIZE);
  const sample = multipleSeries[seriesIndex].data.filter(
    (_, index) => index % sampleStep === 0,
  );
  const totalWidth = sample.reduce(
    (sum, sampledData) =>
      sum +
      measureTextWidth(
        valueFormatter(getY(sampledData)),
        valueProps.fontSize as number,
      ),
    0,
  );
  const labelWidth = totalWidth / sample.length + LABEL_PADDING;
  return Math.ceil((labelWidth * maxSeriesLength) / chartWidth);
}
