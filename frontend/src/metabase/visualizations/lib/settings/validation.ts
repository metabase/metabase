import { t } from "ttag";
import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";
import type { Series, VisualizationSettings } from "metabase-types/api";

export const validateDatasetRows = (series: Series) => {
  if (series.every(({ data: { rows } }) => rows.length === 0)) {
    throw new MinRowsError(1, 0);
  }
};

export const validateChartDataSettings = (settings: VisualizationSettings) => {
  const dimensions = (settings["graph.dimensions"] || []).filter(name => name);
  const metrics = (settings["graph.metrics"] || []).filter(name => name);
  if (dimensions.length < 1 || metrics.length < 1) {
    throw new ChartSettingsError(
      t`Which fields do you want to use for the X and Y axes?`,
      { section: t`Data` },
      t`Choose fields`,
    );
  }
  const seriesOrder = (settings["graph.series_order"] || []).filter(
    series => series.enabled,
  );
  if (dimensions.length > 1 && seriesOrder.length === 0) {
    throw new ChartSettingsError(t`No breakouts are enabled`, {
      section: t`Data`,
    });
  }
};

export const validateStacking = (settings: VisualizationSettings) => {
  if (
    settings["stackable.stack_type"] === "normalized" &&
    settings["graph.y_axis.scale"] === "log"
  ) {
    throw new Error(
      t`It is not possible to use the Log scale for a stacked percentage chart`,
    );
  }
};
