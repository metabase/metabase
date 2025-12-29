import { getIn } from "icepick";
import _ from "underscore";

import type { VisualizationSettingDefinition } from "metabase/visualizations/types";
import type {
  Card,
  TableColumnOrderSetting,
  VirtualCard,
  VisualizationSettings,
} from "metabase-types/api";

// Merge two settings objects together.
// Settings from the second argument take precedence over the first.
export function mergeSettings(
  first: VisualizationSettings = {},
  second: VisualizationSettings = {},
): VisualizationSettings {
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

const mergeTableColumns = (
  firstTableColumns: TableColumnOrderSetting[],
  secondTableColumns: TableColumnOrderSetting[],
) => {
  const addedColumns = firstTableColumns.filter(
    ({ name }) =>
      secondTableColumns.findIndex((col) => col.name === name) === -1,
  );
  const removedColumns = secondTableColumns
    .filter(
      ({ name }) =>
        firstTableColumns.findIndex((col) => col.name === name) === -1,
    )
    .map(({ name }) => name);

  return [
    ...secondTableColumns.filter(({ name }) => !removedColumns.includes(name)),
    ...addedColumns,
  ];
};

export const isSettingHiddenOnDashboards = (
  vizSettingDefinition: VisualizationSettingDefinition<unknown, unknown>,
) => {
  // strict check as by default all settings are visible on dashboards
  return vizSettingDefinition.dashboard === false;
};

/**
 * Filters out visualization settings that should not be persisted in dashcards.
 * Settings with `dashboard: false` are hidden from dashboard UI and should not
 * be saved to avoid overriding the card's settings (like graph.dimensions, graph.metrics).
 */
export function sanitizeDashcardSettings(
  settings: VisualizationSettings,
  vizSettingsDefs: Record<
    string,
    VisualizationSettingDefinition<unknown, unknown>
  >,
): VisualizationSettings {
  return _.pick(settings, (_, key) => {
    const settingDef = vizSettingsDefs[key];
    return !settingDef || !isSettingHiddenOnDashboards(settingDef);
  });
}

export function extendCardWithDashcardSettings(
  card: Card | VirtualCard,
  dashcardSettings?: VisualizationSettings,
): Card | VirtualCard {
  return {
    ...card,
    visualization_settings: mergeSettings(
      card?.visualization_settings,
      dashcardSettings,
    ),
  };
}
