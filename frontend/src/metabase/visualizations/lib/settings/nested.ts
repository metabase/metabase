import type React from "react";
import { t } from "ttag";
import _ from "underscore";

import chartSettingNestedSettings from "metabase/visualizations/components/settings/ChartSettingNestedSettings";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getComputedSettings, getSettingsWidgets } from "../settings";

import { getSettingsModelForSeries } from "./visualization";

type NestedSettingsDefinition<TObject> = {
  objectName: string;
  getObjects: (
    series: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => TObject[];
  getObjectKey: (object: TObject) => string;
  getSettingDefinitionsForObject: (
    rawSeries: RawSeries,
    object: TObject,
  ) => $TODO;
  getInheritedSettingsForObject: (object: TObject) => $TODO;
  component: React.ReactNode;
  getExtraProps: () => $TODO;
};

export function nestedSettings<
  TObject,
  TObjectSettings extends Record<string, unknown>,
  TExtra,
  TSettingsModel,
>(
  id: string,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getSettingDefinitionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  }: NestedSettingsDefinition<TObject>,
) {
  function getComputedSettingsForObject(
    series: RawSeries,
    object: TObject,
    storedSettings: TObjectSettings,
    settingsModel: TSettingsModel,
    extra: TExtra,
  ): Partial<TObjectSettings> {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const inheritedSettings = getInheritedSettingsForObject(object);
    const computedSettings = getComputedSettings(
      settingsDefs,
      object,
      { ...inheritedSettings, ...storedSettings },
      settingsModel,
      extra,
    ) as TObjectSettings;
    // remove undefined settings since they override other settings when merging object
    return _.pick(computedSettings, value => value !== undefined);
  }

  function getComputedSettingsForAllObjects(
    series: RawSeries,
    objects: TObject[],
    allStoredSettings: Record<string, TObjectSettings>,
    settingsModel: unknown,
    extra: TExtra,
  ) {
    const allComputedSettings: Record<string, Partial<TObjectSettings>> = {};
    for (const object of objects) {
      const key = getObjectKey(object);
      allComputedSettings[key] = getComputedSettingsForObject(
        series,
        object,
        allStoredSettings[key] || {},
        settingsModel,
        extra,
      );
    }
    return allComputedSettings;
  }

  function getSettingsWidgetsForObject(
    series: RawSeries,
    object: TObject,
    storedSettings: TObjectSettings,
    onChangeSettings: (settings: TObjectSettings) => void,
    settingsModel,
    extra: TExtra,
  ) {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const computedSettings = getComputedSettingsForObject(
      series,
      object,
      storedSettings,
      settingsModel,
      extra,
    );
    const widgets = getSettingsWidgets(
      settingsDefs,
      storedSettings,
      computedSettings,
      object,
      onChangeSettings,
      settingsModel,
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
        series: RawSeries,
        settings: ComputedVisualizationSettings,
        onChange,
        settingsModel,
        extra: TExtra,
      ) => {
        const objects = getObjects(series, settings, settingsModel);
        const allComputedSettings = getComputedSettingsForAllObjects(
          series,
          objects,
          settings[id],
          settingsModel,
          { series, settings },
        );
        return {
          series,
          settings,
          objects,
          allComputedSettings,
          extra: { series, settings },
          ...def.getExtraProps?.(series, settings, onChange, extra),
          ...extra,
        };
      },
      widget,
      ...def,
    },
    [objectName]: {
      getDefault(
        series: RawSeries,
        settings: ComputedVisualizationSettings,
        settingsModel: TSettingsModel,
      ) {
        const cache = new Map();
        return (object: TObject) => {
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
                settingsModel,
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
