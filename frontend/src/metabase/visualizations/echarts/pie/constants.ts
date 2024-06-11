export const DIMENSIONS = {
  chartLegendMargin: 16,
  sideLen: 540,
  margin: 20,
  slice: {
    thickness: 100,
    borderWidth: 4,
  },
  // placeholders, real values computed below
  innerSideLen: 0,
  outerRadius: 0,
  innerRadius: 0,
};

DIMENSIONS.innerSideLen = DIMENSIONS.sideLen - DIMENSIONS.margin * 2;
DIMENSIONS.outerRadius = DIMENSIONS.innerSideLen / 2;
DIMENSIONS.innerRadius = DIMENSIONS.outerRadius - DIMENSIONS.slice.thickness;

// TODO use this for settings, dynamic
export const SLICE_THRESHOLD = 0.025; // approx 1 degree in percentage

export const OTHER_SLICE_MIN_PERCENTAGE = 0.005;
