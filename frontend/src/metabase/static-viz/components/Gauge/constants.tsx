// Font
export const BASE_FONT_SIZE = 56;
export const SEGMENT_LABEL_FONT_SIZE = BASE_FONT_SIZE * 0.3;

// Margins
const CHART_HORIZONTAL_MARGIN = 10;
export const CHART_VERTICAL_MARGIN = 40;
export const VALUE_MARGIN = 30;
export const SEGMENT_LABEL_MARGIN = SEGMENT_LABEL_FONT_SIZE;
export const DISTANCE_TO_MIDDLE_LABEL_ANCHOR = SEGMENT_LABEL_FONT_SIZE / 2;

// Sizes
const GAUGE_THICKNESS = 70;
export const CHART_WIDTH = 540;
export const GAUGE_OUTER_RADIUS = CHART_WIDTH / 2 - CHART_HORIZONTAL_MARGIN;
export const GAUGE_INNER_RADIUS = GAUGE_OUTER_RADIUS - GAUGE_THICKNESS;
export const CHART_HEIGHT = GAUGE_OUTER_RADIUS + 2 * CHART_VERTICAL_MARGIN;
export const MAX_SEGMENT_VALUE_WIDTH = 150;

// Angles
export const GAUGE_ARC_ANGLE = Math.PI;
export const START_ANGLE = -GAUGE_ARC_ANGLE / 2;
export const END_ANGLE = GAUGE_ARC_ANGLE / 2;
// Only allow the bottom of the gauge label to be above the top of the gauge chart.
// So, the labels don't overlap with the gauge chart, otherwise, uses the label position
// as a left or right anchor instead of a middle anchor to avoid having the labels protrude
// the gauge chart.
export const SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE = Math.acos(
  GAUGE_OUTER_RADIUS / (GAUGE_OUTER_RADIUS + SEGMENT_LABEL_MARGIN),
);
