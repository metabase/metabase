import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import type {
  FormattingColumn,
  SettingsExtra,
} from "metabase/visualizations/types";
import type {
  ColumnSettings as ApiColumnSettings,
  FieldFormattingSettings,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

type ColumnSettingsValue = ApiColumnSettings;
type ColumnSettingsInput = ColumnSettingsValue | FieldFormattingSettings;

type CommonProps = {
  column: FormattingColumn;
  inheritedSettings?: ColumnSettingsValue;
  onChange?: (settings: ColumnSettingsValue) => void;
  onChangeSetting?: (settings: Partial<VisualizationSettings>) => void;
  allowlist?: ReadonlySet<string>;
  denylist?: ReadonlySet<string>;
  extraData?: Omit<SettingsExtra, "series">;
};

type GetWidgetsProps = CommonProps & {
  storedSettings: ColumnSettingsValue;
};

type HasColumnSettingsWidgetsProps = CommonProps & {
  value?: ColumnSettingsInput | null;
};

type ColumnSettingsProps = HasColumnSettingsWidgetsProps & {
  style?: React.CSSProperties;
  variant?: "default" | "form-field";
};

function getWidgets({
  column,
  inheritedSettings = {},
  storedSettings,
  onChange,
  onChangeSetting,
  allowlist,
  denylist,
  extraData = {},
}: GetWidgetsProps) {
  // fake series
  const series: Series = [];
  const defaultUnit = "default";

  // add a "unit" to make certain settings work
  const columnWithUnit: FormattingColumn =
    "unit" in column && column.unit != null
      ? column
      : ({ ...column, unit: defaultUnit } as FormattingColumn);

  const settingsDefs = getSettingDefinitionsForColumn(series, columnWithUnit);

  const computedSettings = getComputedSettings(
    settingsDefs,
    columnWithUnit,
    { ...inheritedSettings, ...storedSettings },
    { series, ...extraData },
  );

  const widgets = getSettingsWidgets(
    settingsDefs,
    storedSettings,
    computedSettings,
    columnWithUnit,
    (changedSettings) => {
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
}: HasColumnSettingsWidgetsProps) {
  const storedSettings: ColumnSettingsValue = { ...(value ?? {}) };
  return getWidgets({ storedSettings, ...props }).length > 0;
}

export const ColumnSettings = ({
  style,
  value,
  variant = "default",
  ...props
}: ColumnSettingsProps) => {
  const storedSettings: ColumnSettingsValue = { ...(value ?? {}) };
  const widgets = getWidgets({ storedSettings, ...props });

  return (
    <div style={{ maxWidth: 300, ...style }} data-testid="column-settings">
      {widgets.length > 0 ? (
        widgets.map((widget) => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
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
