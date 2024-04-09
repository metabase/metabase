import _ from "underscore";

import { getPersistableDefaultSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";

/**
 * Saves to `visualization_settings` property of a question those visualization settings that
 * 1) don't have a value yet and 2) have `persistDefault` flag enabled.
 *
 * Needed for persisting visualization columns for pulses/alerts, see metabase#6749.
 */
export function getQuestionWithDefaultVisualizationSettings(
  question: Question,
  series: Series,
) {
  const oldVizSettings = question.settings();
  const newVizSettings = {
    ...oldVizSettings,
    ...getPersistableDefaultSettingsForSeries(series),
  };

  // Don't update the question unnecessarily
  // (even if fields values haven't changed, updating the settings will make the question appear dirty)
  if (!_.isEqual(oldVizSettings, newVizSettings)) {
    return question.setSettings(newVizSettings);
  } else {
    return question;
  }
}
