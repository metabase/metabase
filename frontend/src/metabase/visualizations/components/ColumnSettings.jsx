/* eslint-disable react/prop-types */
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";

import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import {
  getSettingsWidgets,
  getComputedSettings,
} from "metabase/visualizations/lib/settings";

import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import NoResults from "assets/img/no_results.svg";

function getWidgets({
  column,
  inheritedSettings,
  storedSettings,
  onChange,
  onChangeSetting,
  allowlist,
  denylist,
}) {
  // fake series
  const series = [{ card: {}, data: { rows: [], cols: [] } }];

  // add a "unit" to make certain settings work
  if (column.unit == null) {
    column = { ...column, unit: "default" };
  }

  const settingsDefs = getSettingDefinitionsForColumn(series, column);

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
      if (onChange) {
        onChange({ ...storedSettings, ...changedSettings });
      }
      if (onChangeSetting) {
        onChangeSetting(changedSettings);
      }
    },
    { series },
  );

  return widgets.filter(
    widget =>
      (!allowlist || allowlist.has(widget.id)) &&
      (!denylist || !denylist.has(widget.id)),
  );
}

export function hasColumnSettingsWidgets({ value, ...props }) {
  const storedSettings = value || {};
  return getWidgets({ storedSettings, ...props }).length > 0;
}

const ColumnSettings = ({
  value,
  variant = "default",
  forcefullyShowHiddenSettings = false,
  ...props
}) => {
  const storedSettings = value || {};
  const widgets = getWidgets({ storedSettings, ...props });
  const extraWidgetProps = {};

  if (forcefullyShowHiddenSettings) {
    // Is used for /settings/localization page to list all the date-time settings
    // Consider using independent form UI there
    extraWidgetProps.hidden = false;
  }

  return (
    <div style={{ maxWidth: 300 }}>
      {widgets.length > 0 ? (
        widgets.map(widget => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            {...extraWidgetProps}
            unset={storedSettings[widget.id] === undefined}
            noPadding
            variant={variant}
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
