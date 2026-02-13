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

export interface SettingDefinition {
  readDependencies?: string[];
  writeDependencies?: string[];
  eraseDependencies?: string[];
  useRawSeries?: boolean;
  getValue?: (
    object: unknown,
    settings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => unknown;
  isValid?: (
    object: unknown,
    settings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => boolean;
  getDefault?: (
    object: unknown,
    settings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => unknown;
  default?: unknown;
  getSection?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => string | undefined;
  section?: string;
  getTitle?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => string | undefined;
  title?: string;
  getHidden?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => boolean;
  hidden?: boolean;
  getMarginBottom?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => string | undefined;
  marginBottom?: string;
  getDisabled?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => boolean;
  disabled?: boolean;
  props?: Record<string, unknown>;
  getProps?: (
    object: unknown,
    computedSettings: Record<string, unknown>,
    onChange: (value: unknown, question?: unknown) => void,
    extra: Record<string, unknown>,
    onChangeSettings: (settings: Record<string, unknown>, question?: unknown) => void,
  ) => Record<string, unknown>;
  widget?: string | React.ComponentType<unknown>;
  onUpdate?: (value: unknown, extra: Record<string, unknown>) => void;
  persistDefault?: boolean;
  [key: string]: unknown;
}

export interface SettingsWidget {
  id: string;
  value: unknown;
  section?: string;
  title?: string;
  hidden: boolean;
  marginBottom?: string;
  disabled: boolean;
  props: Record<string, unknown>;
  set: boolean;
  widget: React.ComponentType<unknown> | undefined;
  onChange: (value: unknown, question?: unknown) => void;
  onChangeSettings: (settings: Record<string, unknown>, question?: unknown) => void;
  [key: string]: unknown;
}

export function getComputedSettings(
  settingsDefs: Record<string, SettingDefinition>,
  object: unknown,
  storedSettings: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const computedSettings: Record<string, unknown> = {};
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

    const result = _.compose(
      shouldKeepInternalClickBehavior
        ? _.identity
        : removeInternalClickBehaviors,
      convertLinkColumnToClickBehavior,
    )(computedSettings);

    return result as Record<string, unknown>;
  }

  return computedSettings;
}

function getComputedSetting(
  computedSettings: Record<string, unknown>,
  settingDefs: Record<string, SettingDefinition>,
  settingId: string,
  object: unknown,
  storedSettings: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): void {
  if (settingId in computedSettings) {
    return;
  }

  const settingDef = settingDefs[settingId] || {};
  let resolvedObject = object as Record<string, unknown>;

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

  if (settingDef.useRawSeries && resolvedObject._raw) {
    resolvedObject = resolvedObject._raw as Record<string, unknown>;
  }

  const settings = { ...storedSettings, ...computedSettings };

  try {
    if (settingDef.getValue) {
      (computedSettings[settingId] = settingDef.getValue(
        resolvedObject,
        settings,
        extra,
      ));
      return;
    }

    if (storedSettings[settingId] !== undefined) {
      if (
        !settingDef.isValid ||
        settingDef.isValid(resolvedObject, settings, extra)
      ) {
        computedSettings[settingId] = storedSettings[settingId];
        return;
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(resolvedObject, settings, extra);
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
  settingDefs: Record<string, SettingDefinition>,
  settingId: string,
  storedSettings: Record<string, unknown>,
  computedSettings: Record<string, unknown>,
  object: unknown,
  onChangeSettings: (settings: Record<string, unknown>, question?: unknown) => void,
  extra: Record<string, unknown> = {},
): SettingsWidget {
  const settingDef = settingDefs[settingId];
  const value = computedSettings[settingId];
  const onChange = (newValue: unknown, question?: unknown) => {
    const newSettings: Record<string, unknown> = { [settingId]: newValue };
    for (const depId of settingDef.writeDependencies || []) {
      newSettings[depId] = computedSettings[depId];
    }
    for (const depId of settingDef.eraseDependencies || []) {
      newSettings[depId] = null;
    }
    onChangeSettings(newSettings, question);
    settingDef.onUpdate?.(newValue, extra);
  };
  let resolvedObject = object as Record<string, unknown>;
  if (settingDef.useRawSeries && resolvedObject._raw) {
    (extra as Record<string, unknown>).transformedSeries = object;
    resolvedObject = resolvedObject._raw as Record<string, unknown>;
  }
  return {
    ...settingDef,
    id: settingId,
    value,
    section: settingDef.getSection
      ? settingDef.getSection(resolvedObject, computedSettings, extra)
      : settingDef.section,
    title: settingDef.getTitle
      ? settingDef.getTitle(resolvedObject, computedSettings, extra)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(resolvedObject, computedSettings, extra)
      : settingDef.hidden ?? false,
    marginBottom: settingDef.getMarginBottom
      ? settingDef.getMarginBottom(resolvedObject, computedSettings, extra)
      : settingDef.marginBottom,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(resolvedObject, computedSettings, extra)
      : settingDef.disabled ?? false,
    props: {
      ...(settingDef.props ?? {}),
      ...(settingDef.getProps
        ? settingDef.getProps(
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

export function getSettingsWidgets(
  settingDefs: Record<string, SettingDefinition>,
  storedSettings: Record<string, unknown>,
  computedSettings: Record<string, unknown>,
  object: unknown,
  onChangeSettings: (settings: Record<string, unknown>, question?: unknown) => void,
  extra: Record<string, unknown> = {},
): SettingsWidget[] {
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

export function getPersistableDefaultSettings(
  settingsDefs: Record<string, SettingDefinition>,
  completeSettings: Record<string, unknown>,
): Record<string, unknown> {
  const persistableDefaultSettings: Record<string, unknown> = {};
  for (const settingId in settingsDefs) {
    const settingDef = settingsDefs[settingId];
    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}

export function updateSettings(
  storedSettings: Record<string, unknown>,
  changedSettings: Record<string, unknown>,
): Record<string, unknown> {
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

export function getClickBehaviorSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const newSettings: Record<string, unknown> = {};

  if (settings.click_behavior) {
    newSettings.click_behavior = settings.click_behavior;
  }

  const columnSettings = getColumnClickBehavior(
    settings.column_settings as Record<string, { click_behavior?: unknown }> | undefined,
  );
  if (columnSettings) {
    newSettings.column_settings = columnSettings;
  }

  return newSettings;
}

function getColumnClickBehavior(
  columnSettings: Record<string, { click_behavior?: unknown }> | null | undefined,
): Record<string, { click_behavior: unknown }> | null {
  if (columnSettings == null) {
    return null;
  }

  const result = Object.entries(columnSettings)
    .filter(([, fieldSettings]) => fieldSettings.click_behavior != null)
    .reduce(
      (acc, [key, fieldSettings]) => ({
        ...acc,
        [key]: {
          click_behavior: fieldSettings.click_behavior,
        },
      }),
      {} as Record<string, { click_behavior: unknown }>,
    );
  return Object.keys(result).length > 0 ? result : null;
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
  columnSettings: Record<string, unknown>,
): Record<string, unknown> {
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
