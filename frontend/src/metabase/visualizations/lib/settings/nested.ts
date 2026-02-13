import type React from "react";
import { t } from "ttag";
import _ from "underscore";

import { chartSettingNestedSettings } from "metabase/visualizations/components/settings/ChartSettingNestedSettings";

import { getComputedSettings, getSettingsWidgets } from "../settings";

interface NestedSettingsOptions {
  objectName?: string;
  getObjects: (series: unknown, settings: Record<string, unknown>) => unknown[];
  getObjectKey: (object: unknown) => string;
  getObjectSettings: (
    allStoredSettings: Record<string, unknown>,
    object: unknown,
  ) => Record<string, unknown> | null | undefined;
  getSettingDefinitionsForObject: (
    series: unknown,
    object: unknown,
  ) => Record<string, unknown>;
  getInheritedSettingsForObject?: (object: unknown) => Record<string, unknown>;
  component: React.ComponentType<any>;
  getExtraProps?: (
    series: unknown,
    settings: Record<string, unknown>,
    onChange: (value: unknown) => void,
    extra: Record<string, unknown>,
  ) => Record<string, unknown>;
  [key: string]: unknown;
}

export function nestedSettings(
  id: string,
  {
    objectName = "object",
    getObjects,
    getObjectKey,
    getObjectSettings,
    getSettingDefinitionsForObject,
    getInheritedSettingsForObject = () => ({}),
    component,
    ...def
  }: NestedSettingsOptions,
): Record<string, unknown> {
  function getComputedSettingsForObject(
    series: unknown,
    object: unknown,
    storedSettings: Record<string, unknown>,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    const settingsDefs = getSettingDefinitionsForObject(series, object);
    const inheritedSettings = getInheritedSettingsForObject(object);
    const computedSettings = getComputedSettings(
      settingsDefs,
      object,
      { ...inheritedSettings, ...storedSettings },
      extra,
    );
    return _.pick(computedSettings, (value) => value !== undefined);
  }

  function getComputedSettingsForAllObjects(
    series: unknown,
    objects: unknown[],
    allStoredSettings: Record<string, unknown>,
    extra: Record<string, unknown>,
  ): Record<string, Record<string, unknown>> {
    const allComputedSettings: Record<string, Record<string, unknown>> = {};
    for (const object of objects) {
      const key = getObjectKey(object);
      allComputedSettings[key] = getComputedSettingsForObject(
        series,
        object,
        (getObjectSettings(allStoredSettings, object) as Record<string, unknown>) ?? {},
        extra,
      ) as Record<string, unknown>;
    }
    return allComputedSettings;
  }

  function getSettingsWidgetsForObject(
    series: unknown,
    object: unknown,
    storedSettings: Record<string, unknown>,
    onChangeSettings: (settings: Record<string, unknown>) => void,
    extra: Record<string, unknown>,
  ): unknown[] {
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
        series: unknown,
        settings: Record<string, unknown>,
        onChange: (value: unknown) => void,
        extra: Record<string, unknown>,
      ) => {
        const objects = getObjects(series, settings);
        const allComputedSettings = getComputedSettingsForAllObjects(
          series,
          objects,
          (settings[id] as Record<string, unknown>) ?? {},
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
      getDefault(series: unknown, settings: Record<string, unknown>, extra: Record<string, unknown>) {
        const cache = new Map<string, Record<string, unknown>>();
        return (object: unknown) => {
          const key = getObjectKey(object);
          if (!cache.has(key)) {
            const inheritedSettings = getInheritedSettingsForObject(object);
            const storedSettings =
              (getObjectSettings(settings[id] as Record<string, unknown>, object) as Record<string, unknown>) ?? {};
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
            } as Record<string, unknown>);
          }
          return cache.get(key)!;
        };
      },
      readDependencies: [id],
    },
  };
}
