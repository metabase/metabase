/* @flow */

import _ from "underscore";
import { t } from "ttag";

import { getComputedSettings, getSettingsWidgets } from "../settings";

import chartSettingNestedSettings from "metabase/visualizations/components/settings/ChartSettingNestedSettings";

import type {
  SettingId,
  SettingDef,
  SettingDefs,
  Settings,
  WidgetDef,
  ExtraProps,
} from "metabase/visualizations/lib/settings";

import type { Series } from "metabase-types/types/Visualization";

export type NestedObject = any;
export type NestedObjectKey = string;

type NestedSettingDef = SettingDef & {
  objectName: string,
  getObjects: (series: Series, settings: Settings) => NestedObject[],
  getObjectKey: (object: NestedObject) => string,
  getSettingDefintionsForObject: (
    series: Series,
    object: NestedObject,
  ) => SettingDefs,
  getInheritedSettingsForObject?: (
    object: NestedObject,
  ) => { [key: string]: any },
  component: Class<React$Component<any, any, any>>,
  id?: SettingId,
};

export type SettingsWidgetsForObjectGetter = (
  series: Series,
  object: NestedObject,
  storedSettings: Settings,
  onChangeSettings: (newSettings: Settings) => void,
  extra: ExtraProps,
) => WidgetDef[];

export type NestedObjectKeyGetter = (object: NestedObject) => NestedObjectKey;

export function nestedSettings(
  id: SettingId,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getSettingDefintionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  }: NestedSettingDef = {},
) {
  function getComputedSettingsForObject(series, object, storedSettings, extra) {
    const settingsDefs = getSettingDefintionsForObject(series, object);
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
        return (object: NestedObject) => {
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
