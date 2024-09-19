// minimal set of d3 functions needed for color_selector.js

import { scaleLinear } from "d3-scale";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  scale: {
    linear: scaleLinear,
  },
};
