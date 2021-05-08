import React from "react";

import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";

import { getSettingDefintionsForColumn } from "metabase/visualizations/lib/settings/column";
import {
  getSettingsWidgets,
  getComputedSettings,
} from "metabase/visualizations/lib/settings";

import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import NoResults from "assets/img/no_results.svg";

type SettingId = string;
type Settings = { [id: SettingId]: any };

type Props = {
  value: Settings,
  onChange: (settings: Settings) => void,
  column: any,
  allowlist?: Set<SettingId>,
  denylist?: Set<SettingId>,
  inheritedSettings?: Settings,
};

const ColumnSettings = ({
  value,
  onChange,
  column,
  allowlist,
  denylist,
  inheritedSettings = {},
}: Props) => {
  const storedSettings = value || {};

  // fake series
  const series = [{ card: {}, data: { rows: [], cols: [] } }];

  // add a "unit" to make certain settings work
  if (column.unit == null) {
    column = { ...column, unit: "default" };
  }

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
  ).filter(
    widget =>
      (!allowlist || allowlist.has(widget.id)) &&
      (!denylist || !denylist.has(widget.id)),
  );

  return (
    <div style={{ maxWidth: 300 }}>
      {widgets.length > 0 ? (
        widgets.map(widget => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            // FIXME: this is to force all settings to be visible but causes irrelevant settings to be shown
            hidden={false}
            unset={storedSettings[widget.id] === undefined}
            noPadding
          />
        ))
      ) : (
        <EmptyState
          message={t`No formatting settings`}
          illustrationElement={<img src={NoResults} />}
        />
      )}
    </div>
  );
};

export default ColumnSettings;
