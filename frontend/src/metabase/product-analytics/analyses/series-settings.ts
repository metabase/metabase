import { color } from "metabase/ui/colors";
import type { VisualizationSettings } from "metabase-types/api";

const SERIES_COLOR_NAME = "accent0";
const CONVERSION_DECIMALS = 2;

/** The color of a series that's a baseline to compare with, like an expected rate. */
export const BASELINE_COLOR_NAME = "accent-gray";

/**
 * A metric in the one color product analytics charts share, rather than one
 * hashed from its name. The color name keeps it following the active palette.
 */
export const getSeriesSettings = (
  metric: string,
  title: string,
  colorName: string = SERIES_COLOR_NAME,
): Pick<VisualizationSettings, "series_settings"> => ({
  series_settings: {
    [metric]: {
      title,
      color: color(colorName),
      color_name: colorName,
    },
  },
});

/** Axis titles, in place of the result's column names. */
export const getAxisTitleSettings = ({
  x,
  y,
}: {
  x?: string;
  y: string;
}): Pick<
  VisualizationSettings,
  "graph.x_axis.title_text" | "graph.y_axis.title_text"
> => ({
  ...(x !== undefined ? { "graph.x_axis.title_text": x } : {}),
  "graph.y_axis.title_text": y,
});

/** Formatting for a 0–1 conversion rate in text. */
export const CONVERSION_FORMAT = {
  number_style: "percent",
  decimals: CONVERSION_DECIMALS,
} as const;

/**
 * Formatting for a conversion column in a chart. Fixed decimals would apply to
 * the axis ticks too ("18.00%"), so the default precision is kept.
 */
export const CONVERSION_COLUMN_FORMAT = { number_style: "percent" } as const;

export const getConversionColumnSettings = (
  column: string,
): Pick<VisualizationSettings, "column_settings"> => ({
  column_settings: {
    [JSON.stringify(["name", column])]: CONVERSION_COLUMN_FORMAT,
  },
});
