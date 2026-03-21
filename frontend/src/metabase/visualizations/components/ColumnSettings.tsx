import type React from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import type { DatasetColumn } from "metabase-types/api/dataset";
import type { Field, FieldFormattingSettings } from "metabase-types/api/field";

type Column = DatasetColumn | (Field & { unit?: string });

interface GetWidgetsParams {
  column: Column;
  inheritedSettings: FieldFormattingSettings;
  storedSettings: FieldFormattingSettings;
  onChange?: (settings: FieldFormattingSettings) => void;
  onChangeSetting?: (changedSettings: FieldFormattingSettings) => void;
  allowlist?: Set<string>;
  denylist?: Set<string>;
  extraData?: Record<string, unknown>;
}

interface ColumnSettingsProps extends Omit<GetWidgetsParams, "storedSettings"> {
  value?: FieldFormattingSettings;
  style?: React.CSSProperties;
  variant?: "default" | "form-field";
}

function getWidgets({
  column,
  inheritedSettings,
  storedSettings,
  onChange,
  onChangeSetting,
  allowlist,
  denylist,
  extraData,
}: GetWidgetsParams) {
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
    { series, ...extraData },
  );

  const widgets = getSettingsWidgets(
    settingsDefs,
    storedSettings,
    computedSettings,
    column,
    (changedSettings: FieldFormattingSettings) => {
      if (onChange) {
        onChange({ ...storedSettings, ...changedSettings });
      }
      if (onChangeSetting) {
        onChangeSetting(changedSettings);
      }
    },
    { series, ...extraData },
  );

  return widgets.filter(
    (widget) =>
      (!allowlist || allowlist.has(widget.id)) &&
      (!denylist || !denylist.has(widget.id)),
  );
}

export function hasColumnSettingsWidgets({
  value,
  ...props
}: Omit<GetWidgetsParams, "storedSettings"> & {
  value?: FieldFormattingSettings;
}): boolean {
  const storedSettings: FieldFormattingSettings = value || {};
  return getWidgets({ storedSettings, ...props }).length > 0;
}

export const ColumnSettings = ({
  style,
  value,
  variant = "default",
  ...props
}: ColumnSettingsProps) => {
  const storedSettings: FieldFormattingSettings = value || {};
  const widgets = getWidgets({ storedSettings, ...props });

  return (
    <div style={{ maxWidth: 300, ...style }} data-testid="column-settings">
      {widgets.length > 0 ? (
        widgets.map((widget) => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            unset={
              storedSettings[widget.id as keyof FieldFormattingSettings] ===
              undefined
            }
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
