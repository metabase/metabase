import { color } from "metabase/ui/utils/colors";

export const MAX_WIDTH = 500;
export const PADDING_BOTTOM = 10;

export const OUTER_RADIUS = 45; // within 100px SVG element
export const INNER_RADIUS_RATIO = 3.7 / 5;
export const INNER_RADIUS = OUTER_RADIUS * INNER_RADIUS_RATIO;

// arrow shape, currently an equilateral triangle
export const ARROW_HEIGHT = ((OUTER_RADIUS - INNER_RADIUS) * 2.5) / 4; // 2/3 of segment thickness
export const ARROW_BASE = ARROW_HEIGHT / Math.tan((64 / 180) * Math.PI);
export const ARROW_STROKE_THICKNESS = 1.25;

// colors
export const getBackgroundArcColor = () => color("background-tertiary");
export const getSegmentLabelColor = () => color("text-primary");
export const getCenterLabelColor = () => color("text-primary");
export const getArrowFillColor = () => color("text-secondary-opaque");
export const getArrowStrokeColor = () => color("background-primary");

// in px, because scaling was not working well with PDF Exports (metabase#65322)
export const FONT_SIZE_SEGMENT_LABEL = 4;

// in ems, but within the scaled 100px SVG element
export const FONT_SIZE_CENTER_LABEL_MIN = 0.5;
export const FONT_SIZE_CENTER_LABEL_MAX = 0.7;

// hide labels if SVG width is smaller than this
export const MIN_WIDTH_LABEL_THRESHOLD = 250;

export const LABEL_OFFSET_PERCENT = 1.025;

// total degrees of the arc (180 = semicircle, etc)
export const ARC_DEGREES = 180 + 45 * 2; // semicircle plus a bit
