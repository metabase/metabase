import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import ChartSettingsWidget, {
  type ChartSettingsWidgetVariant,
} from "metabase/visualizations/components/ChartSettingsWidget";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { getSettingsWidgets } from "metabase/visualizations/lib/widgets";
import type {
  FormattingColumn,
  SettingsExtra,
} from "metabase/visualizations/types";
import type {
  ColumnSettings as ApiColumnSettings,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

type CommonProps = {
  column: FormattingColumn;
  inheritedSettings?: ApiColumnSettings;
  onChange?: (settings: ApiColumnSettings) => void;
  onChangeSetting?: (settings: Partial<VisualizationSettings>) => void;
  allowlist?: ReadonlySet<string>;
  denylist?: ReadonlySet<string>;
  extraData?: Omit<SettingsExtra, "series">;
};

type GetWidgetsProps = CommonProps & {
  storedSettings: ApiColumnSettings;
};

type HasColumnSettingsWidgetsProps = CommonProps & {
  value?: ApiColumnSettings | null;
};

type ColumnSettingsProps = HasColumnSettingsWidgetsProps & {
  style?: React.CSSProperties;
  variant?: ChartSettingsWidgetVariant;
};

function getWidgets({
  column,
  inheritedSettings,
  storedSettings,
  onChange,
  onChangeSetting,
  allowlist,
  denylist,
  extraData,
}: GetWidgetsProps) {
  // fake series
  const series: Series = [];

  // add a "unit" to make certain settings work
  const columnWithUnit: FormattingColumn =
    column.unit != null ? column : { ...column, unit: "default" };

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
  const storedSettings = value ?? {};
  return getWidgets({ storedSettings, ...props }).length > 0;
}

export const ColumnSettings = ({
  style,
  value,
  variant = "default",
  ...props
}: ColumnSettingsProps) => {
  const storedSettings = value ?? {};
  const widgets = getWidgets({ storedSettings, ...props });

  return (
    <div style={{ maxWidth: 300, ...style }} data-testid="column-settings">
      {widgets.length > 0 ? (
        widgets.map((widget) => (
          <ChartSettingsWidget
            key={widget.id}
            {...widget}
            style={{
              marginLeft: 0,
              marginRight: 0,
            }}
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
