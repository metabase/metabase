import { t } from "ttag";
import _ from "underscore";

import type { ChartNestedSettingSeriesProps } from "metabase/visualizations/components/settings/ChartNestedSettingSeries";
import { chartSettingNestedSettings } from "metabase/visualizations/components/settings/ChartSettingNestedSettings";
import type {
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type {
  Series,
  VisualizationSettingKey,
  VisualizationSettings,
} from "metabase-types/api";

import { getComputedSettings, getSettingsWidgets } from "../settings";

export interface NestedSettingsOptions<
  T,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> extends VisualizationSettingDefinition<T, TValue, TProps> {
  objectName?: string;
  getObjects: (series: Series, settings: VisualizationSettings) => T[];
  getObjectKey: (object: T) => string;
  getObjectSettings: (
    allStoredSettings: VisualizationSettings,
    object: T,
  ) => VisualizationSettings | undefined;
  getSettingDefinitionsForObject: (
    series: Series,
    object: T,
  ) => VisualizationSettingsDefinitions<T, TValue, TProps>;
  getInheritedSettingsForObject?: (object: T) => VisualizationSettings;
  component: React.ComponentType<ChartNestedSettingSeriesProps>;
  getExtraProps?: (
    series: Series,
    settings: VisualizationSettings,
    onChange: (value: TValue) => void,
    extra?: SettingsExtra,
  ) => Record<string, unknown>;
}

export function nestedSettings<
  T,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(
  id: VisualizationSettingKey,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getObjectSettings,
    getSettingDefinitionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  }: NestedSettingsOptions<T, TValue, TProps>,
): VisualizationSettingsDefinitions<Series, TValue, TProps> {
  function getComputedSettingsForObject(
    series: Series,
    object: T,
    storedSettings: VisualizationSettings,
    extra: SettingsExtra,
  ): ComputedVisualizationSettings {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const inheritedSettings = getInheritedSettingsForObject(object);
    const computedSettings = getComputedSettings(
      settingsDefs,
      object,
      { ...inheritedSettings, ...storedSettings },
      extra,
    );
    // remove undefined settings since they override other settings when merging object
    return _.pick(computedSettings, (value) => value !== undefined);
  }

  function getComputedSettingsForAllObjects(
    series: Series,
    objects: T[],
    allStoredSettings: VisualizationSettings,
    extra: SettingsExtra,
  ): Record<string, ComputedVisualizationSettings> {
    const allComputedSettings: Record<string, ComputedVisualizationSettings> =
      {};

    for (const object of objects) {
      const key = getObjectKey(object);
      allComputedSettings[key] = getComputedSettingsForObject(
        series,
        object,
        getObjectSettings(allStoredSettings, object) ?? {},
        extra,
      );
    }

    return allComputedSettings;
  }

  function getSettingsWidgetsForObject(
    series: Series,
    object: T,
    storedSettings: VisualizationSettings,
    onChangeSettings: (newSettings: Partial<VisualizationSettings>) => void,
    extra: SettingsExtra,
  ) {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const computedSettings = getComputedSettingsForObject(
      series,
      object,
      storedSettings,
      extra,
    );
    const widgets = getSettingsWidgets(
      settingsDefs,
      storedSettings,
      computedSettings,
      object,
      onChangeSettings,
      extra,
    );
    return widgets.map((widget) => ({ ...widget, noPadding: true }));
  }

  // decorate with nested settings HOC
  const widget = chartSettingNestedSettings({
    getObjectKey,
    getObjectSettings,
    getSettingsWidgetsForObject,
  })(component);

  return {
    [id]: {
      section: t`Display`,
      default: {},
      getProps: (
        series: Series,
        settings: VisualizationSettings,
        onChange: (value: unknown) => void,
        extra: SettingsExtra,
      ) => {
        const objects = getObjects(series, settings);
        const allComputedSettings = getComputedSettingsForAllObjects(
          series,
          objects,
          settings[id],
          { series, settings, ...extra },
        );
        return {
          series,
          settings,
          objects,
          allComputedSettings,
          extra: { series, settings },
          ...(def.getExtraProps?.(series, settings, onChange, extra) ?? {}),
          ...extra,
        };
      },
      widget,
      ...def,
    },
    [objectName]: {
      getDefault(
        series: Series,
        settings: VisualizationSettings,
        extra: SettingsExtra,
      ) {
        const cache = new Map<string, VisualizationSettings>();
        return (object: T) => {
          const key = getObjectKey(object);
          if (!cache.has(key)) {
            const inheritedSettings = getInheritedSettingsForObject(object);
            const storedSettings =
              getObjectSettings(settings[id], object) ?? {};
            cache.set(key, {
              ...getComputedSettingsForObject(
                series,
                object,
                {
                  ...inheritedSettings,
                  ...storedSettings,
                },
                { series, settings, ...extra },
              ),
            });
          }
          return cache.get(key);
        };
      },
      readDependencies: [id],
    },
  };
}
