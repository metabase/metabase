import _ from "underscore";
import { t } from "ttag";

import chartSettingNestedSettings from "metabase/visualizations/components/settings/ChartSettingNestedSettings";
import { getComputedSettings, getSettingsWidgets } from "../settings";
import type {
  Series,
  VisualizationSettingId,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";

type NestedSettingsOptions<T> = {
  objectName: string;
  getObjects: (series: Series, settings: VisualizationSettings) => T[];
  getObjectKey: (object: T) => string;
  getSettingDefinitionsForObject: (
    series: Series,
    object: T,
  ) => VisualizationSettingsDefinitions;
  getInheritedSettingsForObject: (
    object: T,
  ) => VisualizationSettingsDefinitions;
  component: unknown;
};

export function nestedSettings<T>(
  id: VisualizationSettingId,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getSettingDefinitionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  }: VisualizationSettingDefinition<Series> & NestedSettingsOptions<T>,
): VisualizationSettingsDefinitions<Series> {
  function getComputedSettingsForObject(
    series: Series,
    object: T,
    storedSettings: any,
    extra: any,
  ) {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const inheritedSettings = getInheritedSettingsForObject(object);
    const computedSettings = getComputedSettings(
      settingsDefs,
      object,
      { ...inheritedSettings, ...storedSettings },
      extra,
    );
    // remove undefined settings since they override other settings when merging object
    return _.pick(computedSettings, value => value !== undefined);
  }

  function getComputedSettingsForAllObjects(
    series: Series,
    objects: T[],
    allStoredSettings: any,
    extra: any,
  ) {
    const allComputedSettings: any = {};
    for (const object of objects) {
      const key = getObjectKey(object);
      allComputedSettings[key] = getComputedSettingsForObject(
        series,
        object,
        allStoredSettings[key] || {},
        extra,
      );
    }
    return allComputedSettings;
  }

  function getSettingsWidgetsForObject(
    series: Series,
    object: T,
    storedSettings: any,
    onChangeSettings: any,
    extra: any,
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
    return widgets.map(widget => ({ ...widget, noPadding: true }));
  }

  // decorate with nested settings HOC
  const widget = chartSettingNestedSettings({
    getObjectKey,
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
        extra: unknown,
      ) => {
        const objects = getObjects(series, settings);
        const allComputedSettings = getComputedSettingsForAllObjects(
          series,
          objects,
          settings[id],
          { series, settings },
        );
        return {
          series,
          settings,
          objects,
          allComputedSettings,
          extra: { series, settings },
          ...(def.getExtraProps?.(series, settings, onChange, extra) as object),
          ...(extra as object),
        };
      },
      widget,
      ...def,
    },
    [objectName]: {
      getDefault(series: Series, settings: VisualizationSettings) {
        const cache = new Map();
        return (object: T) => {
          const key = getObjectKey(object);
          if (!cache.has(key)) {
            const inheritedSettings = getInheritedSettingsForObject(object);
            const storedSettings = settings[id][key] || {};
            cache.set(key, {
              ...getComputedSettingsForObject(
                series,
                object,
                {
                  ...inheritedSettings,
                  ...storedSettings,
                },
                { series, settings },
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
