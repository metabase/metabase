import { getVisualizationRaw } from "metabase/visualizations";
import { t } from "c-3po";
import {
  columnsAreValid,
  getChartTypeFromData,
  DIMENSION_DIMENSION_METRIC,
  DIMENSION_METRIC,
  getFriendlyName,
} from "./utils";

import { isMetric, isDimension } from "metabase/lib/schema_metadata";

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

export function getDefaultDimensionAndMetric([{ data }]) {
  const type = data && getChartTypeFromData(data.cols, data.rows, false);
  if (type === DIMENSION_METRIC) {
    return {
      dimension: data.cols[0].name,
      metric: data.cols[1].name,
    };
  } else if (type === DIMENSION_DIMENSION_METRIC) {
    return {
      dimension: null,
      metric: data.cols[2].name,
    };
  } else {
    return {
      dimension: null,
      metric: null,
    };
  }
}

export function getOptionFromColumn(col) {
  return {
    name: getFriendlyName(col),
    value: col.name,
  };
}

export function metricSetting(id) {
  return fieldSetting(
    id,
    isMetric,
    series => getDefaultDimensionAndMetric(series).metric,
  );
}

export function dimensionSetting(id) {
  return fieldSetting(
    id,
    isDimension,
    series => getDefaultDimensionAndMetric(series).dimension,
  );
}

export function fieldSetting(id, filter, getDefault) {
  return {
    widget: "select",
    isValid: ([{ card, data }], vizSettings) =>
      columnsAreValid(card.visualization_settings[id], data, filter),
    getDefault: getDefault,
    getProps: ([{ card, data: { cols } }]) => ({
      options: cols.filter(filter).map(getOptionFromColumn),
    }),
  };
}

const COMMON_SETTINGS = {
  "card.title": {
    title: t`Title`,
    widget: "input",
    getDefault: series => (series.length === 1 ? series[0].card.name : null),
    dashboard: true,
    useRawSeries: true,
  },
  "card.description": {
    title: t`Description`,
    widget: "input",
    getDefault: series =>
      series.length === 1 ? series[0].card.description : null,
    dashboard: true,
    useRawSeries: true,
  },
};

function getSetting(settingDefs, id, vizSettings, series) {
  if (id in vizSettings) {
    return;
  }

  const settingDef = settingDefs[id] || {};
  const [{ card }] = series;
  const visualization_settings = card.visualization_settings || {};

  for (let dependentId of settingDef.readDependencies || []) {
    getSetting(settingDefs, dependentId, vizSettings, series);
  }

  if (settingDef.useRawSeries && series._raw) {
    series = series._raw;
  }

  try {
    if (settingDef.getValue) {
      return (vizSettings[id] = settingDef.getValue(series, vizSettings));
    }

    if (visualization_settings[id] !== undefined) {
      if (!settingDef.isValid || settingDef.isValid(series, vizSettings)) {
        return (vizSettings[id] = visualization_settings[id]);
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(series, vizSettings);

      return (vizSettings[id] = defaultValue);
    }

    if ("default" in settingDef) {
      return (vizSettings[id] = settingDef.default);
    }
  } catch (e) {
    console.warn("Error getting setting", id, e);
  }
  return (vizSettings[id] = undefined);
}

function getSettingDefintionsForSeries(series) {
  const { CardVisualization } = getVisualizationRaw(series);
  const definitions = {
    ...COMMON_SETTINGS,
    ...(CardVisualization.settings || {}),
  };
  for (const id in definitions) {
    definitions[id].id = id;
  }
  return definitions;
}

export function getPersistableDefaultSettings(series) {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const completeSettings = getSettings(series);

  let persistableDefaultSettings = {};
  let settingsDefs = getSettingDefintionsForSeries(series);

  for (let id in settingsDefs) {
    const settingDef = settingsDefs[id];
    if (settingDef.persistDefault) {
      persistableDefaultSettings[id] = completeSettings[id];
    }
  }

  return persistableDefaultSettings;
}

export function getSettings(series) {
  let vizSettings = {};
  let settingsDefs = getSettingDefintionsForSeries(series);
  for (let id in settingsDefs) {
    getSetting(settingsDefs, id, vizSettings, series);
  }
  return vizSettings;
}

function getSettingWidget(settingDef, vizSettings, series, onChangeSettings) {
  const id = settingDef.id;
  const value = vizSettings[id];
  const onChange = value => {
    const newSettings = { [id]: value };
    for (const id of settingDef.writeDependencies || []) {
      newSettings[id] = vizSettings[id];
    }
    onChangeSettings(newSettings);
  };
  if (settingDef.useRawSeries && series._raw) {
    series = series._raw;
  }
  return {
    ...settingDef,
    id: id,
    value: value,
    title: settingDef.getTitle
      ? settingDef.getTitle(series, vizSettings)
      : settingDef.title,
    hidden: settingDef.getHidden
      ? settingDef.getHidden(series, vizSettings)
      : false,
    disabled: settingDef.getDisabled
      ? settingDef.getDisabled(series, vizSettings)
      : false,
    props: {
      ...(settingDef.props ? settingDef.props : {}),
      ...(settingDef.getProps
        ? settingDef.getProps(series, vizSettings, onChange)
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
  series,
  onChangeSettings,
  isDashboard = false,
) {
  const vizSettings = getSettings(series);
  return Object.values(getSettingDefintionsForSeries(series))
    .map(settingDef =>
      getSettingWidget(settingDef, vizSettings, series, onChangeSettings),
    )
    .filter(
      widget =>
        widget.widget &&
        !widget.hidden &&
        (widget.dashboard === undefined || widget.dashboard === isDashboard),
    );
}
