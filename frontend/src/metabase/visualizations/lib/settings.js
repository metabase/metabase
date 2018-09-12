/* @flow */

import ChartSettingInput from "metabase/visualizations/components/settings/ChartSettingInput.jsx";
import ChartSettingInputGroup from "metabase/visualizations/components/settings/ChartSettingInputGroup.jsx";
import ChartSettingInputNumeric from "metabase/visualizations/components/settings/ChartSettingInputNumeric.jsx";
import ChartSettingRadio from "metabase/visualizations/components/settings/ChartSettingRadio.jsx";
import ChartSettingSelect from "metabase/visualizations/components/settings/ChartSettingSelect.jsx";
import ChartSettingToggle from "metabase/visualizations/components/settings/ChartSettingToggle.jsx";
import ChartSettingFieldPicker from "metabase/visualizations/components/settings/ChartSettingFieldPicker.jsx";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker.jsx";
import ChartSettingColorPicker from "metabase/visualizations/components/settings/ChartSettingColorPicker.jsx";
import ChartSettingColorsPicker from "metabase/visualizations/components/settings/ChartSettingColorsPicker.jsx";

type SettingId = string;

export type Settings = {
  [settingId: SettingId]: any,
};

export type SettingDefs = {
  [settingId: SettingId]: SettingDef,
};

export type SettingDef = {
  id: SettingId,
  value: any,
  title?: string,
  props?: { [key: string]: any },
  default?: any,
  getTitle?: (object: any, settings: Settings) => ?string,
  getHidden?: (object: any, settings: Settings) => boolean,
  getDisabled?: (object: any, settings: Settings) => boolean,
  getProps?: (
    object: any,
    settings: Settings,
    onChange: Function,
  ) => { [key: string]: any },
  getDefault?: (object: any, settings: Settings) => any,
  getValue?: (object: any, settings: Settings) => any,
  isValid?: (object: any, settings: Settings) => boolean,
  widget?: string | React$Component<any, any, any>,
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
  // $FlowFixMe
  widget?: React$Component<any, any, any>,
  onChange: (value: any) => void,
};

const WIDGETS = {
  input: ChartSettingInput,
  inputGroup: ChartSettingInputGroup,
  number: ChartSettingInputNumeric,
  radio: ChartSettingRadio,
  select: ChartSettingSelect,
  toggle: ChartSettingToggle,
  field: ChartSettingFieldPicker,
  fields: ChartSettingFieldsPicker,
  color: ChartSettingColorPicker,
  colors: ChartSettingColorsPicker,
};

export function getComputedSettings(
  settingsDefs: SettingDefs,
  object: any,
  storedSettings: Settings,
) {
  const computedSettings = {};
  for (let settingId in settingsDefs) {
    getComputedSetting(
      computedSettings,
      settingsDefs,
      settingId,
      object,
      storedSettings,
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
): any {
  if (settingId in computedSettings) {
    return;
  }

  const settingDef = settingDefs[settingId] || {};

  for (let dependentId of settingDef.readDependencies || []) {
    getComputedSetting(
      computedSettings,
      settingDefs,
      dependentId,
      storedSettings,
      object,
    );
  }

  if (settingDef.useRawSeries && object._raw) {
    object = object._raw;
  }

  try {
    if (settingDef.getValue) {
      return (computedSettings[settingId] = settingDef.getValue(
        object,
        computedSettings,
      ));
    }

    if (storedSettings[settingId] !== undefined) {
      if (!settingDef.isValid || settingDef.isValid(object, computedSettings)) {
        return (computedSettings[settingId] = storedSettings[settingId]);
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(object, computedSettings);

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
  settings: Settings,
  object: any,
  onChangeSettings: (settings: Settings) => void,
): WidgetDef {
  const settingDef = settingDefs[settingId];
  const value = settings[settingId];
  const onChange = value => {
    const newSettings = { [settingId]: value };
    for (const settingId of settingDef.writeDependencies || []) {
      newSettings[settingId] = settings[settingId];
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
      ? settingDef.getTitle(object, settings)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(object, settings)
      : false,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(object, settings)
      : false,
    props: {
      ...(settingDef.props ? settingDef.props : {}),
      ...(settingDef.getProps
        ? settingDef.getProps(object, settings, onChange)
        : {}),
    },
    widget:
      typeof settingDef.widget === "string"
        ? WIDGETS[settingDef.widget]
        : settingDef.widget,
    onChange,
  };
}

export function getSettingsWidgets(
  settingDefs: SettingDefs,
  settings: Settings,
  object: any,
  onChangeSettings: (settings: Settings) => void,
) {
  return Object.keys(settingDefs)
    .map(settingId =>
      // $FlowFixMe: doesn't understand settingDef is a SettingDef
      getSettingWidget(
        settingDefs,
        settingId,
        settings,
        object,
        onChangeSettings,
      ),
    )
    .filter(widget => widget.widget && !widget.hidden);
}

export function getPersistableDefaultSettings(
  settingsDefs: SettingDefs,
  completeSettings: Settings,
): Settings {
  let persistableDefaultSettings = {};
  for (let settingId in settingsDefs) {
    const settingDef = settingsDefs[settingId];
    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}
