/* @flow */

import _ from "underscore";
import { t } from "c-3po";

import { getComputedSettings, getSettingsWidgets } from "../settings";

import chartSettingNestedSettings from "metabase/visualizations/components/settings/ChartSettingNestedSettings";

import type {
  SettingId,
  SettingDef,
  SettingDefs,
  Settings,
} from "metabase/visualizations/lib/settings";

import type { Series } from "metabase/meta/types/Visualization";

type Object = any;

type NestedSettingDef = SettingDef & {
  objectName: string,
  getObjects: (series: Series, settings: Settings) => Object[],
  getObjectKey: (object: Object) => string,
  getSettingDefintionsForObject: (
    series: Series,
    object: Object,
  ) => SettingDefs,
  getObjectSettingsExtra?: (
    series: Series,
    settings: Settings,
    object: Object,
  ) => { [key: string]: any },
  component: React$Component<any, any, any>,
  id?: SettingId,
};

export function nestedSettings(
  id: SettingId,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getSettingDefintionsForObject,
    getObjectSettingsExtra = () => ({}),
    component,
    ...def
  }: NestedSettingDef = {},
) {
  function getComputedSettingsForObject(series, object, storedSettings, extra) {
    const settingsDefs = getSettingDefintionsForObject(series, object);
    const computedSettings = getComputedSettings(
      settingsDefs,
      object,
      storedSettings,
      extra,
    );
    // remove undefined settings since they override other settings when merging object
    return _.pick(computedSettings, value => value !== undefined);
  }

  function getComputedSettingsForAllObjects(
    series,
    objects,
    allStoredSettings,
    extra,
  ) {
    const allComputedSettings = {};
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
    series,
    object,
    storedSettings,
    onChangeSettings,
    extra,
  ) {
    const settingsDefs = getSettingDefintionsForObject(series, object);
    const computedSettings = getComputedSettingsForObject(
      series,
      object,
      storedSettings,
      extra,
    );
    const widgets = getSettingsWidgets(
      settingsDefs,
      computedSettings,
      object,
      onChangeSettings,
      extra,
    );
    return widgets;
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
      getProps: (series: Series, settings: Settings) => {
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
        };
      },
      widget,
      ...def,
    },
    [objectName]: {
      getDefault(series: Series, settings: Settings) {
        const cache = new Map();
        return (object: Object) => {
          const key = getObjectKey(object);
          if (!cache.has(key)) {
            cache.set(key, {
              ...getComputedSettingsForObject(
                series,
                object,
                settings[id][key] || {},
                { series, settings },
              ),
              ...getObjectSettingsExtra(series, settings, object),
            });
          }
          return cache.get(key);
        };
      },
      readDependencies: [id],
    },
  };
}
