import { t } from "c-3po";
import _ from "underscore";
import { getIn } from "icepick";

import ChartNestedSettingSeries from "metabase/visualizations/components/settings/ChartNestedSettingSeries.jsx";
import { nestedSettings } from "./nested";

export function keyForSingleSeries(single) {
  return String(single.card.name);
}

import colors, { harmony } from "metabase/lib/colors";

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// assigns values to keys using a best effort deterministic algorithm
//  keys: keys that need to be assigned values
//  values: all possible values to assign
//  existing: optional existing assignments
//  getPreferred: to get preferred assignments
function deterministicAssign(keys, values, existing = {}, getPreferred) {
  let unassigned = new Set(keys.slice().sort()); // sort the keys for extra determinism

  let all = new Set(values);
  let used = new Set();

  const assignments = {};

  const assign = (key, value) => {
    assignments[key] = value;
    unassigned.delete(key);
    // if assignment is one of the values mark it as used
    if (all.has(value)) {
      used.add(value);
    }
  };

  // add all exisisting assignments
  for (const [key, value] of Object.entries(existing)) {
    assign(key, value);
  }

  // attempt to get a "preferred" assignment, if desired
  if (getPreferred) {
    for (const key of unassigned) {
      const value = getPreferred(key, values);
      if (value !== undefined && !used.has(value)) {
        assign(key, value);
      }
    }
  }

  // assign as many values as possible. if there are still any remaining, shift by one and try again
  let iterations = 0;
  while (unassigned.size > 0) {
    if (all.size - used.size <= 0) {
      // if all have been used reset available options
      used = new Set();
    }
    for (const key of unassigned) {
      const hash = Math.abs(hashCode(key)) + iterations;
      const value = values[hash % values.length];
      if (!used.has(value)) {
        assign(key, value);
      }
    }
    iterations++;
  }

  return assignments;
}

const PREFERRED_COLORS = {
  [colors["success"]]: [
    "success",
    "valid",
    "complete",
    "completed",
    "accepted",
    "active",
    "profit",
  ],
  [colors["error"]]: [
    "fail",
    "failure",
    "failures",
    "invalid",
    "rejected",
    "inactive",
    "loss",
    "cost",
    "deleted",
    "pending",
  ],
};

const PREFERRED_COLORS_MAP = new Map();
for (const [color, keys] of Object.entries(PREFERRED_COLORS)) {
  for (const key of keys) {
    PREFERRED_COLORS_MAP.set(key, color);
  }
}

function getPreferredColor(key) {
  return PREFERRED_COLORS_MAP.get(key.toLowerCase());
}

const LINE_DISPLAY_TYPES = new Set(["line", "area"]);

export function seriesSetting({
  readDependencies = [],
  noPadding,
  ...def
} = {}) {
  const settingId = "series_settings";
  const colorSettingId = `${settingId}.colors`;

  const COMMON_SETTINGS = {
    // title, display, and color don't need widgets because they're handled direclty in ChartNestedSettingSeries
    title: {
      getDefault: (single, settings, { series, settings: vizSettings }) => {
        const legacyTitles = vizSettings["graph.series_labels"];
        if (legacyTitles) {
          const index = series.indexOf(single); // TODO: pass in series index so we don't have to search for it
          if (index >= 0 && index < legacyTitles.length) {
            return legacyTitles[index];
          }
        }
        return single.card.name;
      },
    },
    display: {
      getDefault: (single, settings, { series }) => {
        if (single.card.display === "combo") {
          const index = series.indexOf(single);
          if (index === 0) {
            return "line";
          } else {
            return "bar";
          }
        } else {
          return single.card.display;
        }
      },
    },
    color: {
      getDefault: (single, settings, { settings: vizSettings }) =>
        // get the color for series key, computed in the setting
        getIn(vizSettings, [colorSettingId, keyForSingleSeries(single)]),
    },
    "line.interpolate": {
      title: t`Line style`,
      widget: "buttonGroup",
      props: {
        options: [
          { icon: "straight", name: t`Line`, value: "linear" },
          { icon: "curved", name: t`Curve`, value: "cardinal" },
          { icon: "stepped", name: t`Step`, value: "step-after" },
        ],
      },
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.interpolate setting if present
        vizSettings["line.interpolate"] || "linear",
      readDependencies: ["display"],
    },
    "line.marker_enabled": {
      title: t`Show dots on lines`,
      widget: "buttonGroup",
      props: {
        options: [
          { name: t`Auto`, value: null },
          { name: t`On`, value: true },
          { name: t`Off`, value: false },
        ],
      },
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.marker_enabled setting if present
        vizSettings["line.marker_enabled"] == null
          ? null
          : vizSettings["line.marker_enabled"],
      readDependencies: ["display"],
    },
    "line.missing": {
      title: t`Replace missing values with`,
      widget: "select",
      props: {
        options: [
          { name: t`Zero`, value: "zero" },
          { name: t`Nothing`, value: "none" },
          { name: t`Linear Interpolated`, value: "interpolate" },
        ],
      },
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.missing setting if present
        vizSettings["line.missing"] || "interpolate",
      readDependencies: ["display"],
    },
    axis: {
      title: t`Which axis?`,
      widget: "buttonGroup",
      default: null,
      props: {
        options: [
          { name: t`Auto`, value: null },
          { name: t`Left`, value: "left" },
          { name: t`Right`, value: "right" },
        ],
      },
      getHidden: (single, settings, { series }) => series.length < 2,
    },
  };

  function getSettingDefintionsForSingleSeries(series, object, settings) {
    return COMMON_SETTINGS;
  }

  return {
    ...nestedSettings(settingId, {
      objectName: "series",
      getObjects: (series, settings) => series,
      getObjectKey: keyForSingleSeries,
      getSettingDefintionsForObject: getSettingDefintionsForSingleSeries,
      component: ChartNestedSettingSeries,
      readDependencies: [colorSettingId, ...readDependencies],
      noPadding: true,
      ...def,
    }),
    // colors must be computed as a whole rather than individually
    [colorSettingId]: {
      getValue(series, settings) {
        const keys = series.map(single => keyForSingleSeries(single));
        const values = Object.values(harmony).slice(0, 8);
        const assignments = _.chain(keys)
          .map(key => [key, getIn(settings, [settingId, key, "color"])])
          .filter(([key, color]) => color != null)
          .object()
          .value();

        const legacyColors = settings["graph.colors"];
        if (legacyColors) {
          for (const [index, key] of keys.entries()) {
            if (!(key in assignments)) {
              assignments[key] = legacyColors[index];
            }
          }
        }

        return deterministicAssign(
          keys,
          values,
          assignments,
          getPreferredColor,
        );
      },
    },
  };
}
