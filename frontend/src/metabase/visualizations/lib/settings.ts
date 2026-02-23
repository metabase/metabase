import type React from "react";
import _ from "underscore";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  convertLinkColumnToClickBehavior,
  removeInternalClickBehaviors,
} from "metabase/embedding-sdk/lib/links";
import { ChartSettingColorPicker } from "metabase/visualizations/components/settings/ChartSettingColorPicker";
import { ChartSettingColorsPicker } from "metabase/visualizations/components/settings/ChartSettingColorsPicker";
import { ChartSettingFieldPicker } from "metabase/visualizations/components/settings/ChartSettingFieldPicker";
import { ChartSettingFieldsPartition } from "metabase/visualizations/components/settings/ChartSettingFieldsPartition";
import { ChartSettingFieldsPicker } from "metabase/visualizations/components/settings/ChartSettingFieldsPicker";
import { ChartSettingInput } from "metabase/visualizations/components/settings/ChartSettingInput";
import { ChartSettingInputNumeric } from "metabase/visualizations/components/settings/ChartSettingInputNumeric";
import { ChartSettingMultiSelect } from "metabase/visualizations/components/settings/ChartSettingMultiSelect";
import { ChartSettingRadio } from "metabase/visualizations/components/settings/ChartSettingRadio";
import { ChartSettingSegmentedControl } from "metabase/visualizations/components/settings/ChartSettingSegmentedControl";
import { ChartSettingSelect } from "metabase/visualizations/components/settings/ChartSettingSelect";
import { ChartSettingToggle } from "metabase/visualizations/components/settings/ChartSettingToggle";
import type {
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { ColumnSettings, VisualizationSettings } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

const WIDGETS: Record<string, React.ComponentType<any>> = {
  input: ChartSettingInput,
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
  multiselect: ChartSettingMultiSelect,
};

export function getComputedSettings<T>(
  settingsDefs: VisualizationSettingsDefinitions,
  object: T,
  storedSettings: VisualizationSettings,
  extra: SettingsExtra = {},
): ComputedVisualizationSettings {
  const computedSettings: ComputedVisualizationSettings = {};

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

  if (isEmbeddingSdk()) {
    const shouldKeepInternalClickBehavior = extra.enableEntityNavigation;

    const result: ComputedVisualizationSettings = _.compose(
      // remove internal click behaviors unless internal navigation is enabled
      shouldKeepInternalClickBehavior
        ? _.identity
        : removeInternalClickBehaviors,
      convertLinkColumnToClickBehavior,
    )(computedSettings);

    return result;
  }

  return computedSettings;
}

function getComputedSetting<T>(
  computedSettings: ComputedVisualizationSettings,
  settingDefs: VisualizationSettingsDefinitions,
  settingId: keyof ComputedVisualizationSettings,
  object: T,
  storedSettings: VisualizationSettings,
  extra: SettingsExtra = {},
): void {
  if (settingId in computedSettings) {
    return;
  }

  const settingDef = settingDefs[settingId] ?? {};

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

  const resolvedObject =
    settingDef.useRawSeries && isObjectWithRaw(object) && object._raw
      ? object._raw
      : object;

  const settings: ComputedVisualizationSettings = {
    ...storedSettings,
    ...computedSettings,
  };

  try {
    if (settingDef.getValue) {
      computedSettings[settingId] = settingDef.getValue(
        resolvedObject,
        settings,
        extra,
      );
      return;
    }

    if (storedSettings[settingId] !== undefined) {
      const isValid = settingDef.isValid;
      if (!isValid || isValid(resolvedObject, settings, extra)) {
        computedSettings[settingId] = storedSettings[settingId];
        return;
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(
        resolvedObject,
        settings,
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

function isObjectWithRaw<T>(object: T): object is T & { _raw?: T } {
  return isObject(object) && "_raw" in object;
}

export function getSettingsWidgets<T>(
  settingDefs: VisualizationSettingsDefinitions,
  storedSettings: VisualizationSettings,
  computedSettings: ComputedVisualizationSettings,
  object: T,
  onChangeSettings: (
    newSettings: Partial<VisualizationSettings>,
    question?: Question,
  ) => void,
  extra: SettingsExtra = {},
) {
  return Object.keys(settingDefs)
    .map((settingId) =>
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
    .filter((widget) => widget.widget);
}

function getSettingWidget<T, TValue, TProps>(
  settingDefs: VisualizationSettingsDefinitions,
  settingId: keyof ComputedVisualizationSettings,
  storedSettings: VisualizationSettings,
  computedSettings: ComputedVisualizationSettings,
  object: T,
  onChangeSettings: (
    newSettings: Partial<VisualizationSettings>,
    question?: Question,
  ) => void,
  extra: SettingsExtra = {},
): VisualizationSettingDefinition<T, TValue, TProps> {
  const settingDefUntyped = settingDefs[settingId] ?? {};
  const settingDef = settingDefUntyped as VisualizationSettingDefinition<
    T,
    TValue,
    TProps
  >;
  const value = computedSettings[settingId];
  const onChange = (
    newValue: VisualizationSettings[keyof VisualizationSettings],
    question?: Question,
  ) => {
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

  const getHiddenFn = settingDef.getHidden;
  const getPropsFn = settingDef.getProps;

  return {
    ...settingDef,
    id: settingId,
    value,
    section: settingDef.getSection
      ? settingDef.getSection(resolvedObject, computedSettings, extra)
      : settingDef.section,
    hidden: getHiddenFn
      ? getHiddenFn(resolvedObject, computedSettings, extra)
      : (settingDef.hidden ?? false),
    marginBottom: settingDef.getMarginBottom
      ? settingDef.getMarginBottom(resolvedObject, computedSettings, extra)
      : settingDef.marginBottom,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(resolvedObject, computedSettings, extra)
      : (settingDef.disabled ?? false),
    props: {
      ...(settingDef.props && typeof settingDef.props === "object"
        ? settingDef.props
        : {}),
      ...(getPropsFn
        ? getPropsFn(
            resolvedObject,
            computedSettings,
            onChange,
            extra,
            onChangeSettings,
          )
        : {}),
    },
    set: settingId in storedSettings,
    widget:
      typeof settingDef.widget === "string"
        ? WIDGETS[settingDef.widget]
        : settingDef.widget,
    onChange,
    onChangeSettings,
  };
}

export function getPersistableDefaultSettings(
  settingsDefs: VisualizationSettingsDefinitions,
  completeSettings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  const persistableDefaultSettings: ComputedVisualizationSettings = {};

  for (const settingId in settingsDefs) {
    const settingDef = settingsDefs[settingId];

    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}

export function updateSettings(
  storedSettings: VisualizationSettings,
  changedSettings: Partial<VisualizationSettings>,
): VisualizationSettings {
  const newSettings = {
    ...storedSettings,
    ...changedSettings,
  };
  for (const [key, value] of Object.entries(changedSettings)) {
    if (value === undefined) {
      delete newSettings[key];
    }
  }
  return newSettings;
}

export function getClickBehaviorSettings(
  settings: VisualizationSettings | null | undefined,
): VisualizationSettings {
  if (!settings) {
    return {};
  }
  const newSettings: VisualizationSettings = {};

  if (settings.click_behavior) {
    newSettings.click_behavior = settings.click_behavior;
  }

  const columnSettings = getColumnClickBehavior(settings.column_settings);

  if (columnSettings) {
    newSettings.column_settings = columnSettings;
  }

  return newSettings;
}

function getColumnClickBehavior(
  columnSettings: Record<string, ColumnSettings> | null | undefined,
): Record<string, ColumnSettings> | null {
  if (columnSettings == null) {
    return null;
  }

  const entries = Object.entries(columnSettings).filter(
    ([, fieldSettings]) => fieldSettings.click_behavior != null,
  );

  if (entries.length === 0) {
    return null;
  }

  return entries.reduce(
    (acc, [key, fieldSettings]) => ({
      ...acc,
      [key]: {
        click_behavior: fieldSettings.click_behavior,
      },
    }),
    {},
  );
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

export function getLineAreaBarComparisonSettings(
  columnSettings: ColumnSettings,
): Partial<ColumnSettings> {
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
