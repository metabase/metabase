import React from "react";

import { getSettingDefintionsForColumn } from "metabase/visualizations/lib/settings/column";
import {
  getSettingsWidgets,
  getComputedSettings,
} from "metabase/visualizations/lib/settings";

import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

const ColumnSettings = ({ value, onChange, column, settings = null }) => {
  const settingsSet = settings && new Set(settings);

  const storedSettings = value || {};

  // fake series
  const series = [{ card: {}, data: { rows: [], cols: [] } }];

  const settingsDefs = getSettingDefintionsForColumn(series, column);

  const computedSettings = getComputedSettings(
    settingsDefs,
    column,
    storedSettings,
    { series },
  );

  const widgets = getSettingsWidgets(
    settingsDefs,
    computedSettings,
    column,
    changedSettings => {
      onChange({ ...storedSettings, ...changedSettings });
    },
    { series },
  );

  return (
    <div>
      {widgets
        .filter(widget => !settingsSet || settingsSet.has(widget.id))
        .map(widget => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            hidden={false}
            noPadding
          />
        ))}
    </div>
  );
};

export default ColumnSettings;
