import {
  getAccentColors,
  getStatusColorRanges,
} from "metabase/lib/colors/groups";
import type {
  NumberRangeFormattingSetting,
  NumberSingleFormattingSetting,
} from "./types";

export const COLORS = getAccentColors({ dark: false });
export const COLOR_RANGES = getStatusColorRanges();

export const DEFAULTS_BY_TYPE: {
  single: NumberSingleFormattingSetting;
  range: NumberRangeFormattingSetting;
} = {
  single: {
    type: "single",
    operator: "=",
    value: "",
    color: COLORS[0],
  },
  range: {
    type: "range",
    colors: COLOR_RANGES[0],
    min_type: "custom",
    max_type: "custom",
    min_value: 0,
    max_value: 100,
  },
};
