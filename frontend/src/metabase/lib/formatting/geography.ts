import d3 from "d3";

import { decimalCount } from "metabase/visualizations/lib/numeric";
import { isLatitude, isLongitude } from "metabase-lib/v1/types/utils/isa";

import type { OptionsType } from "./types";

const DECIMAL_DEGREES_FORMATTER = d3.format(".08f");
const DECIMAL_DEGREES_FORMATTER_COMPACT = d3.format(".02f");
const BINNING_DEGREES_FORMATTER = (value: number, binWidth: number) => {
  return d3.format(`.0${decimalCount(binWidth)}f`)(value);
};

export function formatCoordinate(value: number, options: OptionsType = {}) {
  const binWidth = options.column?.binning_info?.bin_width;

  let direction = "";

  if (isLatitude(options.column)) {
    direction = " " + (value < 0 ? "S" : "N");
    value = Math.abs(value);
  } else if (isLongitude(options.column)) {
    direction = " " + (value < 0 ? "W" : "E");
    value = Math.abs(value);
  }

  const formattedValue = binWidth
    ? BINNING_DEGREES_FORMATTER(value, binWidth)
    : options.compact
    ? DECIMAL_DEGREES_FORMATTER_COMPACT(value)
    : DECIMAL_DEGREES_FORMATTER(value);
  return formattedValue + "°" + direction;
}
