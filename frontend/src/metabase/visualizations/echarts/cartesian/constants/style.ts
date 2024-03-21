export const CHART_STYLE = {
  series: {
    zIndex: 2, // Note: goal line (which uses echarts' markLine) has a fixed z value of 5 https://github.com/apache/echarts/blob/fbee94d5dd3fe8a957524620eb3657145670bd50/src/component/marker/MarkLineModel.ts#L116
    zIndexLineArea: 3, // https://github.com/metabase/metabase/issues/40209
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
    zIndex: 10,
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
  trendLine: {
    zIndex: 3,
  },
  timelineEvents: {
    height: 14,
    minDistance: 16,
    countLabelMargin: 4,
    zIndex: 1,
  },
  opacity: {
    blur: 0.3,
    area: 0.3,
    scatter: 0.8,
  },
};
