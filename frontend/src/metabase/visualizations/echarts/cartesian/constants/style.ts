import type { LineSize } from "metabase-types/api";

export const LINE_SIZE: Record<LineSize, number> = {
  S: 1,
  M: 2,
  L: 3,
};

export const Z_INDEXES = {
  // Note: timeline events use echarts' markline option, which has a fixed z
  // value of 5.
  dataLabels: 8,
  goalLine: 7,
  trendLine: 7,
  lineAreaSeries: 7,
  series: 6, // Bars needs to have a lower z value than line/area series, see issue #40209
};

export const CHART_STYLE = {
  series: {
    barWidth: 0.8,
    histogramBarWidth: 0.995,
  },
  axisTicksMarginX: 5,
  axisTicksMarginY: 10,
  axisTicks: {
    size: 12,
    weight: 700,
  },
  seriesLabels: {
    weight: 600,
    size: 12,
    offset: 4,
    stackedPadding: 2,
  },
  axisName: {
    size: 12,
    weight: 700,
  },
  axisNameMargin: 12,
  padding: {
    x: 8,
    y: 12,
  },
  symbolSize: 6,
  timelineEvents: {
    height: 14,
    minDistance: 16,
    countLabelMargin: 4,
  },
  goalLine: {
    label: {
      margin: 4,
      size: 14,
      weight: 600,
    },
  },
  opacity: {
    blur: 0.3,
    area: 0.3,
    scatter: 0.8,
  },
};
