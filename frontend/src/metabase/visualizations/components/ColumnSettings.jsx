/* @flow */

import React from "react";

import { getSettingDefintionsForColumn } from "metabase/visualizations/lib/settings/column";
import {
  getSettingsWidgets,
  getComputedSettings,
} from "metabase/visualizations/lib/settings";

import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

type SettingId = string;
type Settings = { [id: SettingId]: any };

type Props = {
  value: Settings,
  onChange: (settings: Settings) => void,
  column: any,
  whitelist?: Set<SettingId>,
  blacklist?: Set<SettingId>,
  inheritedSettings?: Settings,
};

const ColumnSettings = ({
  value,
  onChange,
  column,
  whitelist,
  blacklist,
  inheritedSettings = {},
}: Props) => {
  const storedSettings = value || {};

  // fake series
  const series = [{ card: {}, data: { rows: [], cols: [] } }];

  const settingsDefs = getSettingDefintionsForColumn(series, column);

  const computedSettings = getComputedSettings(
    settingsDefs,
    column,
    { ...inheritedSettings, ...storedSettings },
    { series },
  );

  const widgets = getSettingsWidgets(
    settingsDefs,
    storedSettings,
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
        .filter(
          widget =>
            (!whitelist || whitelist.has(widget.id)) &&
            (!blacklist || !blacklist.has(widget.id)),
        )
        .map(widget => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            hidden={false}
            unset={storedSettings[widget.id] === undefined}
            noPadding
          />
        ))}
    </div>
  );
};

export default ColumnSettings;
