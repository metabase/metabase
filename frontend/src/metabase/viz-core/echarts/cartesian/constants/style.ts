import type { LineSize } from "metabase-types/api";

export const LINE_SIZE: Record<LineSize, number> = {
  S: 1,
  M: 2,
  L: 3,
};

export const Z_INDEXES = {
  brushMirror: 100,
  dataLabels: 8,
  goalLine: 7,
  trendLine: 7,
  lineAreaSeries: 7,
  series: 6, // Bars needs to have a lower z value than line/area series, see issue #40209
};

export const TIMELINE_EVENTS_BAND = {
  chipWidth: 32,
  chipHeight: 24,
  bandPaddingY: 4,
  marginY: 8,
  chipGap: 2,
};

export const TIMELINE_BAND_HEIGHT =
  TIMELINE_EVENTS_BAND.chipHeight + 2 * TIMELINE_EVENTS_BAND.bandPaddingY;

const TIMELINE_BAND_RESERVED_HEIGHT =
  TIMELINE_BAND_HEIGHT + 2 * TIMELINE_EVENTS_BAND.marginY;

export const CHART_STYLE = {
  series: {
    barWidth: 0.8,
    histogramBarWidth: 0.995,
  },
  axisTicksMarginX: 5,
  axisTicksMarginY: 10,
  axisTicks: {
    weight: 400,
  },
  seriesLabels: {
    weight: 700,
    size: 13,
    offset: 4,
    stackedPadding: 2,
  },
  axisName: {
    weight: 400,
  },
  axisNameMargin: 12,
  padding: {
    x: 8,
    y: 12,
  },
  symbolSize: 6,
  timelineEvents: {
    height: TIMELINE_BAND_RESERVED_HEIGHT,
    minDistance: TIMELINE_EVENTS_BAND.chipWidth + TIMELINE_EVENTS_BAND.chipGap, // Min center-to-center distance before chips merge
    countLabelMargin: 4,
    selectionLineWidth: 2,
  },
  goalLine: {
    label: {
      margin: 4,
      size: 13,
      weight: 400,
    },
  },
  opacity: {
    blur: 0.3,
    area: 0.3,
    areaFocused: 0.6,
    areaBlurred: 0.2,
    scatter: 0.8,
  },
  brush: {
    fillOpacity: 0.1,
    borderOpacity: 0.4,
    borderWidth: 1,
  },
  splitPanel: {
    gapRatio: 2.2,
    maxGap: 48,
  },
};

export function getSplitPanelGap(panelHeight: number): number {
  return Math.min(
    panelHeight / CHART_STYLE.splitPanel.gapRatio,
    CHART_STYLE.splitPanel.maxGap,
  );
}
