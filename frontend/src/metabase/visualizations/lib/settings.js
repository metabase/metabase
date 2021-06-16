import { getIn } from "icepick";

import * as React from "react";

import ChartSettingInput from "metabase/visualizations/components/settings/ChartSettingInput";
import ChartSettingInputGroup from "metabase/visualizations/components/settings/ChartSettingInputGroup";
import ChartSettingInputNumeric from "metabase/visualizations/components/settings/ChartSettingInputNumeric";
import ChartSettingRadio from "metabase/visualizations/components/settings/ChartSettingRadio";
import ChartSettingSelect from "metabase/visualizations/components/settings/ChartSettingSelect";
import ChartSettingToggle from "metabase/visualizations/components/settings/ChartSettingToggle";
import ChartSettingButtonGroup from "metabase/visualizations/components/settings/ChartSettingButtonGroup";
import ChartSettingFieldPicker from "metabase/visualizations/components/settings/ChartSettingFieldPicker";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker";
import ChartSettingFieldsPartition from "metabase/visualizations/components/settings/ChartSettingFieldsPartition";
import ChartSettingColorPicker from "metabase/visualizations/components/settings/ChartSettingColorPicker";
import ChartSettingColorsPicker from "metabase/visualizations/components/settings/ChartSettingColorsPicker";

import MetabaseAnalytics from "metabase/lib/analytics";

export type SettingId = string;

export type Settings = {
  [settingId: SettingId]: any,
};

export type SettingDefs = {
  [settingId: SettingId]: SettingDef,
};

export type SettingDef = {
  title?: string,
  props?: { [key: string]: any },
  default?: any,
  hidden?: boolean,
  disabled?: boolean,
  getTitle?: (object: any, settings: Settings, extra: ExtraProps) => ?string,
  getHidden?: (object: any, settings: Settings, extra: ExtraProps) => boolean,
  getDisabled?: (object: any, settings: Settings, extra: ExtraProps) => boolean,
  getProps?: (
    object: any,
    settings: Settings,
    onChange: Function,
    extra: ExtraProps,
  ) => { [key: string]: any },
  getDefault?: (object: any, settings: Settings, extra: ExtraProps) => any,
  getValue?: (object: any, settings: Settings, extra: ExtraProps) => any,
  isValid?: (object: any, settings: Settings, extra: ExtraProps) => boolean,
  widget?: string | React.Component,
  writeDependencies?: SettingId[],
  readDependencies?: SettingId[],
};

export type WidgetDef = {
  id: SettingId,
  value: any,
  title: ?string,
  hidden: boolean,
  disabled: boolean,
  props: { [key: string]: any },
  widget?: React.Component,
  onChange: (value: any) => void,
};

export type ExtraProps = { [key: string]: any };

const WIDGETS = {
  input: ChartSettingInput,
  inputGroup: ChartSettingInputGroup,
  number: ChartSettingInputNumeric,
  radio: ChartSettingRadio,
  select: ChartSettingSelect,
  toggle: ChartSettingToggle,
  buttonGroup: ChartSettingButtonGroup,
  field: ChartSettingFieldPicker,
  fields: ChartSettingFieldsPicker,
  fieldsPartition: ChartSettingFieldsPartition,
  color: ChartSettingColorPicker,
  colors: ChartSettingColorsPicker,
};

export function getComputedSettings(
  settingsDefs: SettingDefs,
  object: any,
  storedSettings: Settings,
  extra?: ExtraProps = {},
) {
  const computedSettings = {};
  for (const settingId in settingsDefs) {
    getComputedSetting(
      computedSettings,
      settingsDefs,
      settingId,
      object,
      storedSettings,
      extra,
    );
  }
  return computedSettings;
}

function getComputedSetting(
  computedSettings: Settings, // MUTATED!
  settingDefs: SettingDefs,
  settingId: SettingId,
  object: any,
  storedSettings: Settings,
  extra?: ExtraProps = {},
): any {
  if (settingId in computedSettings) {
    return;
  }

  const settingDef = settingDefs[settingId] || {};

  for (const dependentId of settingDef.readDependencies || []) {
    getComputedSetting(
      computedSettings,
      settingDefs,
      dependentId,
      object,
      storedSettings,
      extra,
    );
  }

  if (settingDef.useRawSeries && object._raw) {
    object = object._raw;
  }

  const settings = { ...storedSettings, ...computedSettings };

  try {
    if (settingDef.getValue) {
      return (computedSettings[settingId] = settingDef.getValue(
        object,
        settings,
        extra,
      ));
    }

    if (storedSettings[settingId] !== undefined) {
      if (!settingDef.isValid || settingDef.isValid(object, settings, extra)) {
        return (computedSettings[settingId] = storedSettings[settingId]);
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(object, settings, extra);

      return (computedSettings[settingId] = defaultValue);
    }

    if ("default" in settingDef) {
      return (computedSettings[settingId] = settingDef.default);
    }
  } catch (e) {
    console.warn("Error getting setting", settingId, e);
  }
  return (computedSettings[settingId] = undefined);
}

function getSettingWidget(
  settingDefs: SettingDefs,
  settingId: SettingId,
  storedSettings: Settings,
  computedSettings: Settings,
  object: any,
  onChangeSettings: (settings: Settings) => void,
  extra?: ExtraProps = {},
): WidgetDef {
  const settingDef = settingDefs[settingId];
  const value = computedSettings[settingId];
  const onChange = value => {
    const newSettings = { [settingId]: value };
    for (const settingId of settingDef.writeDependencies || []) {
      newSettings[settingId] = computedSettings[settingId];
    }
    onChangeSettings(newSettings);
  };
  if (settingDef.useRawSeries && object._raw) {
    object = object._raw;
  }
  return {
    ...settingDef,
    id: settingId,
    value: value,
    title: settingDef.getTitle
      ? settingDef.getTitle(object, computedSettings, extra)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(object, computedSettings, extra)
      : settingDef.hidden || false,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(object, computedSettings, extra)
      : settingDef.disabled || false,
    props: {
      ...(settingDef.props ? settingDef.props : {}),
      ...(settingDef.getProps
        ? settingDef.getProps(object, computedSettings, onChange, extra)
        : {}),
    },
    set: settingId in storedSettings,
    widget:
      typeof settingDef.widget === "string"
        ? WIDGETS[settingDef.widget]
        : settingDef.widget,
    onChange,
    onChangeSettings, // this gives a widget access to update other settings
  };
}

export function getSettingsWidgets(
  settingDefs: SettingDefs,
  storedSettings: Settings,
  computedSettings: Settings,
  object: any,
  onChangeSettings: (settings: Settings) => void,
  extra?: ExtraProps = {},
) {
  return Object.keys(settingDefs)
    .map(settingId =>
      getSettingWidget(
        settingDefs,
        settingId,
        storedSettings,
        computedSettings,
        object,
        onChangeSettings,
        extra,
      ),
    )
    .filter(widget => widget.widget);
}

export function getPersistableDefaultSettings(
  settingsDefs: SettingDefs,
  completeSettings: Settings,
): Settings {
  const persistableDefaultSettings = {};
  for (const settingId in settingsDefs) {
    const settingDef = settingsDefs[settingId];
    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}

export function updateSettings(
  storedSettings: Settings,
  changedSettings: Settings,
): Settings {
  for (const key of Object.keys(changedSettings)) {
    MetabaseAnalytics.trackEvent("Chart Settings", "Change Setting", key);
  }
  const newSettings = {
    ...storedSettings,
    ...changedSettings,
  };
  // remove undefined settings
  for (const [key, value] of Object.entries(changedSettings)) {
    if (value === undefined) {
      delete newSettings[key];
    }
  }
  return newSettings;
}

// Merge two settings objects together.
// Settings from the second argument take precedence over the first.
export function mergeSettings(first: Settings = {}, second: Settings = {}) {
  // Note: This hardcoded list of all nested settings is potentially fragile,
  // but both the list of nested settings and the keys used are very stable.
  const nestedSettings = ["series_settings", "column_settings"];
  const merged = { ...first, ...second };
  for (const key of nestedSettings) {
    // only set key if one of the objects to be merged has that key set
    if (first[key] != null || second[key] != null) {
      merged[key] = {};
      for (const nestedKey of Object.keys({ ...first[key], ...second[key] })) {
        merged[key][nestedKey] = mergeSettings(
          getIn(first, [key, nestedKey]) || {},
          getIn(second, [key, nestedKey]) || {},
        );
      }
    }
  }
  return merged;
}

export function getClickBehaviorSettings(settings) {
  const newSettings = {};

  if (settings.click_behavior) {
    newSettings.click_behavior = settings.click_behavior;
  }

  const columnSettings = getColumnClickBehavior(settings.column_settings);
  if (columnSettings) {
    newSettings.column_settings = columnSettings;
  }

  return newSettings;
}

function getColumnClickBehavior(columnSettings) {
  if (columnSettings == null) {
    return null;
  }

  return Object.entries(columnSettings)
    .filter(([_, fieldSettings]) => fieldSettings.click_behavior != null)
    .reduce((acc, [key, fieldSettings]) => {
      return {
        ...acc,
        [key]: {
          click_behavior: fieldSettings.click_behavior,
        },
      };
    }, null);
}
