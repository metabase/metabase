import { t } from "ttag";
import _ from "underscore";

import chartSettingNestedSettings from "metabase/visualizations/components/settings/ChartSettingNestedSettings";

import { getComputedSettings, getSettingsWidgets } from "../settings";

export function nestedSettings(
  id,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getObjectSettings,
    getSettingDefinitionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  } = {},
) {
  function getComputedSettingsForObject(series, object, storedSettings, extra) {
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
        getObjectSettings(allStoredSettings, object) ?? {},
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
    getObjectSettings,
    getSettingsWidgetsForObject,
  })(component);

  return {
    [id]: {
      section: t`Display`,
      default: {},
      getProps: (series, settings, onChange, extra) => {
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
          ...def.getExtraProps?.(series, settings, onChange, extra),
          ...extra,
        };
      },
      widget,
      ...def,
    },
    [objectName]: {
      getDefault(series, settings) {
        const cache = new Map();
        return object => {
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
