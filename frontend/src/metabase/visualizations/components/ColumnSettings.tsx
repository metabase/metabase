import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import ChartSettingsWidget, {
  type ChartSettingsWidgetVariant,
} from "metabase/visualizations/components/ChartSettingsWidget";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { getSettingsWidgets } from "metabase/visualizations/lib/widgets";
import type { SettingsExtra } from "metabase/visualizations/types";
import type {
  ColumnSettings as ApiColumnSettings,
  DatasetColumn,
  Field,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

type CommonProps = {
  column: DatasetColumn | Field;
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

// The settings pipeline works on DatasetColumns, but the metadata editors pass
// raw Fields; a Field is a column of its table, so it only needs `source` (and
// a numeric `id` — a Field's id may be a field reference) to become one.
function toDatasetColumn(column: DatasetColumn | Field): DatasetColumn {
  if ("source" in column) {
    return column;
  }
  const { id, ...field } = column;
  return {
    ...field,
    id: typeof id === "number" ? id : undefined,
    source: "fields",
  };
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
}: GetWidgetsProps) {
  // fake series
  const series: Series = [];

  const datasetColumn = toDatasetColumn(column);

  // add a "unit" to make certain settings work
  const columnWithUnit: DatasetColumn =
    datasetColumn.unit != null
      ? datasetColumn
      : { ...datasetColumn, unit: "default" };

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
