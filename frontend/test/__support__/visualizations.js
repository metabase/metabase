import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { formatValueForTooltip } from "metabase/visualizations/lib/tooltip";

export const Column = (col = {}) => ({
  ...col,
  name: col.name || "column_name",
  display_name: col.display_name || col.name || "column_display_name",
});

export const BooleanColumn = (col = {}) =>
  Column({ base_type: "type/Boolean", semantic_type: null, ...col });
export const DateTimeColumn = (col = {}) =>
  Column({ base_type: "type/DateTime", semantic_type: null, ...col });
export const NumberColumn = (col = {}) =>
  Column({ base_type: "type/Integer", semantic_type: "type/Number", ...col });
export const StringColumn = (col = {}) =>
  Column({ base_type: "type/Text", semantic_type: null, ...col });

export const Card = (name, ...overrides) =>
  deepExtend(
    {
      card: {
        name: name + "_name",
        visualization_settings: {},
      },
    },
    ...overrides,
  );

function deepExtend(target, ...sources) {
  for (const source of sources) {
    for (const prop in source) {
      if (Object.prototype.hasOwnProperty.call(source, prop)) {
        if (
          target[prop] &&
          typeof target[prop] === "object" &&
          source[prop] &&
          typeof source[prop] === "object"
        ) {
          deepExtend(target[prop], source[prop]);
        } else {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target;
}

export function dispatchUIEvent(element, eventName) {
  const e = document.createEvent("UIEvents");
  e.initUIEvent(eventName, true, true, window, 1);
  element.dispatchEvent(e);
}

export function renderChart(renderer, element, series, props) {
  const chartType = series[0].card.display;
  const settings = getComputedSettingsForSeries(series);

  return renderer(element, {
    chartType,
    series,
    settings,
    ...props,
  });
}

export function renderLineAreaBar(...args) {
  return renderChart(lineAreaBarRenderer, ...args);
}

// mirrors logic in ChartTooltip
export function getFormattedTooltips(hover, settings) {
  let data;
  if (hover.data) {
    data = hover.data;
  } else {
    data = [];
    if (hover.dimensions) {
      for (const dimension of hover.dimensions) {
        data.push({ value: dimension.value, col: dimension.column });
      }
    }
    if (hover.value !== undefined) {
      data.push({ value: hover.value, col: hover.column });
    }
  }
  return data.map(({ value, col: column }) =>
    formatValueForTooltip({ value, column, settings }),
  );
}

export function createFixture() {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="fixture" style="height: 800px; width: 1200px;">',
  );
  return document.getElementById("fixture");
}

export function cleanupFixture(element) {
  element.parentNode.removeChild(element);
}
