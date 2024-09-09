import { getIn } from "icepick";

import type {
  Card,
  TableColumnOrderSetting,
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

export function extendCardWithDashcardSettings(
  card?: Card,
  dashcardSettings?: VisualizationSettings,
): Card {
  return {
    ...card,
    visualization_settings: mergeSettings(
      card?.visualization_settings,
      dashcardSettings,
    ),
  };
}
