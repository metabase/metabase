import { getSettingWidgetComponent } from "metabase/visualizations";
import {
  getComputedSettingsForSeries,
  getSettingDefinitionsForSeries,
  getStoredSettingsForSeries,
} from "metabase/visualizations/lib/settings/visualization";
import type {
  CompleteVisualizationSettingDefinition,
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Series,
  VisualizationSettingKey,
  VisualizationSettings,
} from "metabase-types/api";
import { isObjectWithRaw } from "metabase-types/guards";

function getSettingWidget<T, TValue, TProps extends Record<string, unknown>>(
  settingDefs: VisualizationSettingsDefinitions,
  settingId: VisualizationSettingKey,
  storedSettings: VisualizationSettings,
  computedSettings: ComputedVisualizationSettings,
  object: T,
  onChangeSettings: (
    newSettings: Partial<VisualizationSettings>,
    question?: Question,
  ) => void,
  extra: SettingsExtra = {},
): CompleteVisualizationSettingDefinition<T, TValue, TProps> {
  const settingDef: VisualizationSettingDefinition<T, TValue, TProps> =
    settingDefs[settingId] ?? {};
  const value = computedSettings[settingId];

  const onChange = (newValue: TValue, question?: Question) => {
    const newSettings: Partial<VisualizationSettings> = {
      [settingId]: newValue,
    };
    for (const depId of settingDef.writeDependencies || []) {
      newSettings[depId] = computedSettings[depId];
    }
    for (const eraseId of settingDef.eraseDependencies || []) {
      newSettings[eraseId] = null;
    }
    onChangeSettings(newSettings, question);
    settingDef.onUpdate?.(newValue, extra);
  };

  let resolvedObject = object;
  if (settingDef.useRawSeries && isObjectWithRaw(object) && object._raw) {
    //  only if object is (RawSeries | TransformedSeries)
    if (Array.isArray(object)) {
      extra.transformedSeries = object;
    }

    resolvedObject = object._raw;
  }

  const {
    getProps,
    getWrapperStyle,
    getSection,
    getHidden,
    ...settingDefProps
  } = settingDef;

  return {
    ...settingDefProps,
    id: settingId,
    value,
    section: getSection?.(resolvedObject, computedSettings, extra),
    hidden: getHidden?.(resolvedObject, computedSettings, extra) ?? false,
    props:
      getProps?.(
        resolvedObject,
        computedSettings,
        onChange,
        extra,
        onChangeSettings,
      ) ?? {},
    set: settingId in storedSettings,
    widget:
      typeof settingDef.widget === "string"
        ? getSettingWidgetComponent(settingDef.widget)
        : settingDef.widget,
    style: getWrapperStyle?.(resolvedObject, computedSettings, extra),
    onChange,
    onChangeSettings, // this gives a widget access to update other settings
  };
}

export function getSettingsWidgets<
  T,
  TValue,
  TProps extends Record<string, unknown>,
>(
  settingDefs: VisualizationSettingsDefinitions,
  storedSettings: VisualizationSettings,
  computedSettings: ComputedVisualizationSettings,
  object: T,
  onChangeSettings: (
    newSettings: Partial<VisualizationSettings>,
    question?: Question,
  ) => void,
  extra: SettingsExtra = {},
): CompleteVisualizationSettingDefinition<T, TValue, TProps>[] {
  return Object.keys(settingDefs)
    .map((settingId) =>
      getSettingWidget<T, TValue, TProps>(
        settingDefs,
        settingId,
        storedSettings,
        computedSettings,
        object,
        onChangeSettings,
        extra,
      ),
    )
    .filter((widget) => widget.widget);
}

export function getSettingsWidgetsForSeries(
  series: Series | null | undefined,
  onChangeSettings: (newSettings: Partial<VisualizationSettings>) => void,
  isDashboard = false,
  extra: SettingsExtra = {},
) {
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);

  return getSettingsWidgets(
    settingsDefs,
    storedSettings,
    computedSettings,
    series ?? [],
    onChangeSettings,
    { isDashboard, ...extra },
  ).filter(
    (widget) =>
      widget.dashboard === undefined || widget.dashboard === isDashboard,
  );
}
