import _ from "underscore";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { ChartSettingColorPicker } from "metabase/visualizations/components/settings/ChartSettingColorPicker";
import ChartSettingColorsPicker from "metabase/visualizations/components/settings/ChartSettingColorsPicker";
import { ChartSettingFieldPicker } from "metabase/visualizations/components/settings/ChartSettingFieldPicker";
import { ChartSettingFieldsPartition } from "metabase/visualizations/components/settings/ChartSettingFieldsPartition";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker";
import { ChartSettingInput } from "metabase/visualizations/components/settings/ChartSettingInput";
import { ChartSettingInputNumeric } from "metabase/visualizations/components/settings/ChartSettingInputNumeric";
import { ChartSettingMultiSelect } from "metabase/visualizations/components/settings/ChartSettingMultiSelect";
import { ChartSettingRadio } from "metabase/visualizations/components/settings/ChartSettingRadio";
import { ChartSettingSegmentedControl } from "metabase/visualizations/components/settings/ChartSettingSegmentedControl";
import { ChartSettingSelect } from "metabase/visualizations/components/settings/ChartSettingSelect";
import { ChartSettingToggle } from "metabase/visualizations/components/settings/ChartSettingToggle";

const WIDGETS = {
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

export function getComputedSettings(
  settingsDefs,
  object,
  storedSettings,
  extra = {},
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

  if (isEmbeddingSdk()) {
    // In modular embedding (react sdk and embed-js) we disable internal click behaviors
    // but we want to keep external links (EMB-878) and clicking on the cell should fallback to
    // drills if available (EMB-879)
    if (
      computedSettings.click_behavior &&
      computedSettings.click_behavior.type === "link" &&
      computedSettings.click_behavior.linkType !== "url"
    ) {
      computedSettings.click_behavior = undefined;
    }

    // EMB-890: map urls to click behavior to support `mapQuestionClickActions`
    const isLinkColumn =
      computedSettings.view_as === "link" ||
      (computedSettings.column?.semantic_type === "type/URL" &&
        computedSettings.view_as === "auto");

    // Map links to click behaviors
    if (isLinkColumn) {
      const linkURL = computedSettings.link_url;
      const linkText = computedSettings.link_text;
      const colName = computedSettings.column?.name;

      computedSettings.view_as = undefined;
      computedSettings.link_url = undefined;
      computedSettings.link_text = undefined;
      return {
        ...computedSettings,
        view_as: undefined,
        link_url: undefined,
        link_text: undefined,
        click_behavior: {
          type: "link",
          linkType: "url",
          linkTextTemplate:
            linkText == null && colName ? `{{${colName}}}` : linkText,
          linkTemplate: linkURL == null && colName ? `{{${colName}}}` : linkURL,
        },
        column_settings: {},
      };
    }
  }

  return computedSettings;
}

function getComputedSetting(
  computedSettings, // MUTATED!
  settingDefs,
  settingId,
  object,
  storedSettings,
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
  settingDefs,
  settingId,
  storedSettings,
  computedSettings,
  object,
  onChangeSettings,
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
  if (settingDef.useRawSeries && object._raw) {
    extra.transformedSeries = object;
    object = object._raw;
  }
  return {
    ...settingDef,
    id: settingId,
    value: value,
    section: settingDef.getSection
      ? settingDef.getSection(object, computedSettings, extra)
      : settingDef.section,
    title: settingDef.getTitle
      ? settingDef.getTitle(object, computedSettings, extra)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(object, computedSettings, extra)
      : settingDef.hidden || false,
    marginBottom: settingDef.getMarginBottom
      ? settingDef.getMarginBottom(object, computedSettings, extra)
      : settingDef.marginBottom,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(object, computedSettings, extra)
      : settingDef.disabled || false,
    props: {
      ...(settingDef.props ? settingDef.props : {}),
      ...(settingDef.getProps
        ? settingDef.getProps(
            object,
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
    onChangeSettings, // this gives a widget access to update other settings
  };
}

export function getSettingsWidgets(
  settingDefs,
  storedSettings,
  computedSettings,
  object,
  onChangeSettings,
  extra = {},
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
