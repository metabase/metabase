import _ from "underscore";

import { equals } from "metabase/lib/utils";
import type { Series } from "metabase-types/api";

/**
 * Check if the visualization is currently loading data
 */
export function isLoading(series: Series | null) {
  return !(
    series &&
    series.length > 0 &&
    _.every(
      series,
      (s) => !!s.data || _.isObject(s.card.visualization_settings.virtual_card),
    )
  );
}

/**
 * Derivation of state from props for Visualization component
 */
export function deriveStateFromProps(props: any) {
  const transformed = props.rawSeries
    ? props.getVisualizationTransformed(
        props.extractRemappings(props.rawSeries),
      )
    : null;

  const series = transformed?.series ?? null;

  const computedSettings = !isLoading(series)
    ? props.getComputedSettingsForSeries(series)
    : {};

  return {
    series,
    computedSettings,
    visualization: transformed?.visualization,
  };
}

/**
 * Compare warnings arrays for equality
 */
export function warningsChanged(prevWarnings: string[], warnings: string[]) {
  return !equals(prevWarnings, warnings);
}

export const SMALL_CARD_WIDTH_THRESHOLD = 150;
