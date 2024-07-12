import { getIn } from "icepick";
import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { ChartSettingColorPicker } from "metabase/visualizations/components/settings/ChartSettingColorPicker";
import ChartSettingColorsPicker from "metabase/visualizations/components/settings/ChartSettingColorsPicker";
import ChartSettingFieldPicker from "metabase/visualizations/components/settings/ChartSettingFieldPicker";
import ChartSettingFieldsPartition from "metabase/visualizations/components/settings/ChartSettingFieldsPartition";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker";
import ChartSettingInput from "metabase/visualizations/components/settings/ChartSettingInput";
import ChartSettingInputGroup from "metabase/visualizations/components/settings/ChartSettingInputGroup";
import { ChartSettingInputNumeric } from "metabase/visualizations/components/settings/ChartSettingInputNumeric";
import ChartSettingRadio from "metabase/visualizations/components/settings/ChartSettingRadio";
import ChartSettingSegmentedControl from "metabase/visualizations/components/settings/ChartSettingSegmentedControl";
import ChartSettingSelect from "metabase/visualizations/components/settings/ChartSettingSelect";
import ChartSettingToggle from "metabase/visualizations/components/settings/ChartSettingToggle";

const WIDGETS = {
  input: ChartSettingInput,
  inputGroup: ChartSettingInputGroup,
  number: ChartSettingInputNumeric,
  radio: ChartSettingRadio,
  select: ChartSettingSelect,
  toggle: ChartSettingToggle,
  segmentedControl: ChartSettingSegmentedControl,
  field: ChartSettingFieldPicker,
  fields: ChartSettingFieldsPicker,
  fieldsPartition: ChartSettingFieldsPartition,
  color: ChartSettingColorPicker,
  colors: ChartSettingColorsPicker,
};

export function getComputedSettings<
  TObject,
  TObjectSettings,
  TSettingsModel,
  TExtra,
>(
  settingsDefs: $TODO,
  object: TObject,
  storedSettings: TObjectSettings,
  settingsModel: TSettingsModel,
  extra: TExtra = {},
) {
  const computedSettings = {};
  for (const settingId in settingsDefs) {
    getComputedSetting(
      computedSettings,
      settingsDefs,
      settingId,
      object,
      storedSettings,
      settingsModel,
      extra,
    );
  }
  return computedSettings;
}

function getComputedSetting(
  computedSettings, // MUTATED!
  settingDefs,
  settingId,
  object,
  storedSettings,
  settingsModel,
  extra = {},
) {
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
      settingsModel,
      extra,
    );
  }

  const settings = { ...storedSettings, ...computedSettings };

  try {
    if (settingDef.getValue) {
      computedSettings[settingId] = settingDef.getValue(
        object,
        settings,
        settingsModel,
        extra,
      );
      return;
    }

    if (storedSettings[settingId] !== undefined) {
      if (
        !settingDef.isValid ||
        settingDef.isValid(object, settings, settingsModel, extra)
      ) {
        computedSettings[settingId] = storedSettings[settingId];
        return;
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(
        object,
        settings,
        settingsModel,
        extra,
      );

      computedSettings[settingId] = defaultValue;
      return;
    }

    if ("default" in settingDef) {
      computedSettings[settingId] = settingDef.default;
      return;
    }
  } catch (e) {
    console.warn("Error getting setting", settingId, e);
  }

  computedSettings[settingId] = undefined;
}

function getSettingWidget(
  settingDefs,
  settingId,
  storedSettings,
  computedSettings,
  object,
  onChangeSettings,
  settingsModel,
  extra = {},
) {
  const settingDef = settingDefs[settingId];
  const value = computedSettings[settingId];
  const onChange = (value, question) => {
    const newSettings = { [settingId]: value };
    for (const settingId of settingDef.writeDependencies || []) {
      newSettings[settingId] = computedSettings[settingId];
    }
    for (const settingId of settingDef.eraseDependencies || []) {
      newSettings[settingId] = null;
    }
    onChangeSettings(newSettings, question);
    settingDef.onUpdate?.(value, extra);
  };

  return {
    ...settingDef,
    id: settingId,
    value: value,
    section: settingDef.getSection
      ? settingDef.getSection(object, computedSettings, settingsModel, extra)
      : settingDef.section,
    title: settingDef.getTitle
      ? settingDef.getTitle(object, computedSettings, settingsModel, extra)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(object, computedSettings, settingsModel, extra)
      : settingDef.hidden || false,
    marginBottom: settingDef.getMarginBottom
      ? settingDef.getMarginBottom(
          object,
          computedSettings,
          settingsModel,
          extra,
        )
      : settingDef.marginBottom,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(object, computedSettings, settingsModel, extra)
      : settingDef.disabled || false,
    props: {
      settingsModel,
      ...(settingDef.props ? settingDef.props : {}),
      ...(settingDef.getProps
        ? settingDef.getProps(
            object,
            computedSettings,
            onChange,
            settingsModel,
            extra,
          )
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

export function getSettingsWidgets<
  TObject,
  TObjectSettings,
  TSettingsModel,
  TExtra,
>(
  settingDefs: $TODO,
  storedSettings: TObjectSettings,
  computedSettings: $TODO,
  object: TObject,
  onChangeSettings: $TODO,
  settingsModel: TSettingsModel,
  extra: TExtra = {},
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
        settingsModel,
        extra,
      ),
    )
    .filter(widget => widget.widget);
}

export function getPersistableDefaultSettings(settingsDefs, completeSettings) {
  const persistableDefaultSettings = {};
  for (const settingId in settingsDefs) {
    const settingDef = settingsDefs[settingId];
    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}

export function updateSettings(storedSettings, changedSettings) {
  for (const key of Object.keys(changedSettings)) {
    MetabaseAnalytics.trackStructEvent("Chart Settings", "Change Setting", key);
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
export function mergeSettings(first = {}, second = {}) {
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

  if (first["table.columns"] && second["table.columns"]) {
    merged["table.columns"] = mergeTableColumns(
      first["table.columns"],
      second["table.columns"],
    );
  }

  return merged;
}

const mergeTableColumns = (firstTableColumns, secondTableColumns) => {
  const addedColumns = firstTableColumns.filter(
    ({ name }) => secondTableColumns.findIndex(col => col.name === name) === -1,
  );
  const removedColumns = secondTableColumns
    .filter(
      ({ name }) =>
        firstTableColumns.findIndex(col => col.name === name) === -1,
    )
    .map(({ name }) => name);

  return [
    ...secondTableColumns.filter(({ name }) => !removedColumns.includes(name)),
    ...addedColumns,
  ];
};

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

const KEYS_TO_COMPARE = new Set([
  "number_style",
  "currency",
  "currency_style",
  "number_separators",
  "decimals",
  "scale",
  "prefix",
  "suffix",
]);

export function getLineAreaBarComparisonSettings(columnSettings) {
  return _.pick(columnSettings, (value, key) => {
    if (!KEYS_TO_COMPARE.has(key)) {
      return false;
    }
    if ((key === "prefix" || key === "suffix") && value === "") {
      return false;
    }
    return true;
  });
}
