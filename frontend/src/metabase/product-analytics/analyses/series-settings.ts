import { color } from "metabase/ui/colors";
import type { VisualizationSettings } from "metabase-types/api";

const SERIES_COLOR_NAME = "accent0";

/**
 * A metric in the one color product analytics charts share, rather than one
 * hashed from its name. The color name keeps it following the active palette.
 */
export const getSeriesSettings = (
  metric: string,
  title: string,
): Pick<VisualizationSettings, "series_settings"> => ({
  series_settings: {
    [metric]: {
      title,
      color: color(SERIES_COLOR_NAME),
      color_name: SERIES_COLOR_NAME,
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

/**
 * Formatting for a conversion column in a chart. Fixed decimals would apply to
 * the axis ticks too ("18.00%"), so the default precision is kept.
 */
const CONVERSION_COLUMN_FORMAT = { number_style: "percent" } as const;

export const getConversionColumnSettings = (
  column: string,
): Pick<VisualizationSettings, "column_settings"> => ({
  column_settings: {
    [JSON.stringify(["name", column])]: CONVERSION_COLUMN_FORMAT,
  },
});
