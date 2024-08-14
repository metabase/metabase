import { t } from "ttag";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";

export const validateDatasetRows = series => {
  const singleSeriesHasNoRows = ({ data: { rows } }) => rows.length === 0;
  if (_.every(series, singleSeriesHasNoRows)) {
    throw new MinRowsError(1, 0);
  }
};

export const validateChartDataSettings = settings => {
  const dimensions = (settings["graph.dimensions"] || []).filter(isNotNull);
  const metrics = (settings["graph.metrics"] || []).filter(isNotNull);
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

export const validateStacking = settings => {
  if (
    settings["stackable.stack_type"] === "normalized" &&
    settings["graph.y_axis.scale"] === "log"
  ) {
    throw new Error(
      t`It is not possible to use the Log scale for a stacked percentage chart`,
    );
  }
};
