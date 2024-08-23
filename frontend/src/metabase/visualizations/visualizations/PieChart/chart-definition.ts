import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { ChartSettingOrderedSimple } from "metabase/visualizations/components/settings/ChartSettingOrderedSimple";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { seriesSetting } from "metabase/visualizations/lib/settings/series";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getAggregatedRows,
  getColors,
  getDefaultPercentVisibility,
  getDefaultShowLegend,
  getDefaultSliceThreshold,
  getKeyFromDimensionValue,
  getSortedAggregatedRows,
  getSortedRows,
} from "metabase/visualizations/shared/settings/pie";
import { getDefaultShowTotal } from "metabase/visualizations/shared/settings/waterfall";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { RawSeries, RowValue, RowValues } from "metabase-types/api";

import { SliceNameWidget } from "./SliceNameWidget";

export const PIE_CHART_DEFINITION: VisualizationDefinition = {
  uiName: t`Pie`,
  identifier: "pie",
  iconName: "pie",
  minSize: getMinSize("pie"),
  defaultSize: getDefaultSize("pie"),
  isSensible: ({ cols }) => cols.length === 2,
  checkRenderable: (
    [
      {
        data: { rows },
      },
    ],
    settings,
  ) => {
    // This prevents showing "Which columns do you want to use" when
    // the piechart is displayed with no results in the dashboard
    if (rows.length < 1) {
      throw new MinRowsError(1, 0);
    }
    if (!settings["pie.dimension"] || !settings["pie.metric"]) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: `Data`,
      });
    }
  },
  placeholderSeries: [
    {
      card: {
        display: "pie",
        visualization_settings: { "pie.show_legend": false },
        dataset_query: { type: "query" },
      },
      data: {
        rows: [
          ["Doohickey", 3976],
          ["Gadget", 4939],
          ["Gizmo", 4784],
          ["Widget", 5061],
        ],
        cols: [
          { name: "Category", base_type: "type/Category" },
          { name: "Count", base_type: "type/Integer" },
        ],
      },
    },
  ] as RawSeries,
  settings: {
    ...columnSettings({ hidden: true }),
    ...dimensionSetting("pie.dimension", {
      section: t`Data`,
      title: t`Dimension`,
      showColumnSetting: true,
    }),
    "pie.rows": {
      section: t`Data`,
      widget: ChartSettingOrderedSimple,
      // TODO re-use in static viz
      getValue: (rawSeries, settings) => {
        const [
          {
            data: { cols, rows: dataRows },
          },
        ] = rawSeries;

        const getColumnSettings = settings["column"];
        if (!getColumnSettings) {
          throw Error("`settings.column` is undefined");
        }

        const dimensionCol = cols.find(
          c => c.name === settings["pie.dimension"],
        );
        if (dimensionCol == null) {
          throw Error(
            `Could not find column based on "pie.dimension setting with value ${settings["pie.dimension"]}`,
          );
        }

        const dimensionColSettings = getColumnSettings(dimensionCol);

        const formatDimensionValue = (value: RowValue) => {
          if (value == null) {
            return NULL_DISPLAY_VALUE;
          }

          const formattedValue = formatValue(value, dimensionColSettings);
          return String(formattedValue);
        };

        // TODO parameterize the above so it can be passed as an arg for static viz

        const dimensionIndex = cols.findIndex(
          col => col.name === settings["pie.dimension"],
        );
        const metricIndex = cols.findIndex(
          col => col.name === settings["pie.metric"],
        );

        let colors = getColors(rawSeries, settings);
        // `pie.colors` is a legacy setting used by old questions for their
        // colors. We'll still read it to preserve those color selections, but
        // will no longer write values to it, instead storing colors here in
        // `pie.rows`.
        if (settings["pie.colors"] != null) {
          colors = { ...colors, ...settings["pie.colors"] };
        }
        const savedPieRows = settings["pie.rows"];
        if (savedPieRows != null) {
          const savedPieKeys = savedPieRows.map(pieRow => pieRow.key);

          const keyToSavedPieRow = new Map<PieRow["key"], PieRow>();
          savedPieRows.map(pieRow => keyToSavedPieRow.set(pieRow.key, pieRow));

          const currentDataRows = getAggregatedRows(
            dataRows,
            dimensionIndex,
            metricIndex,
          );

          const keyToCurrentDataRow = new Map<PieRow["key"], RowValues>();
          const currentDataKeys = currentDataRows.map(dataRow => {
            const key = getKeyFromDimensionValue(dataRow[dimensionIndex]);
            keyToCurrentDataRow.set(key, dataRow);

            return key;
          });

          const added = _.difference(currentDataKeys, savedPieKeys);
          const removed = _.difference(savedPieKeys, currentDataKeys);
          const kept = _.intersection(savedPieKeys, currentDataKeys);

          let newPieRows: PieRow[] = [];
          // Case 1: Auto sorted
          if (settings["pie.sort_rows"]) {
            const sortedCurrentDataRows = getSortedRows(dataRows, metricIndex);

            newPieRows = sortedCurrentDataRows.map(dataRow => {
              const dimensionValue = dataRow[dimensionIndex];
              const key = getKeyFromDimensionValue(dimensionValue);

              const savedRow = keyToSavedPieRow.get(key);
              if (savedRow != null) {
                const newRow = { ...savedRow, hidden: false };

                if (savedRow.defaultColor) {
                  // Historically we have used the dimension value in the `pie.colors`
                  // setting instead of the key computed above, e.g. `null` instead of
                  // `(empty)`. For compatibility with existing questions we will
                  // continue to use the dimension value.
                  newRow.color = colors[String(dimensionValue)];
                }

                return newRow;
              }

              // TODO I think these two conditions can be merged
              const color = colors[String(dimensionValue)];
              const name = formatDimensionValue(dimensionValue);

              return {
                key,
                name,
                originalName: name,
                color,
                defaultColor: true,
                enabled: true,
                hidden: false,
              };
            });
            // Case 2: Preserve manual sort for existing rows, sort `added` rows
          } else {
            newPieRows = kept.map(keptKey => {
              const savedPieRow = keyToSavedPieRow.get(keptKey);
              if (savedPieRow == null) {
                throw Error(
                  `Did not find saved pie row for kept key ${keptKey}`,
                );
              }

              return {
                ...savedPieRow,
                hidden: false,
              };
            });

            const addedRows = added.map(addedKey => {
              const dataRow = keyToCurrentDataRow.get(addedKey);
              if (dataRow == null) {
                throw Error(
                  `Could not find data row for added key ${addedKey}`,
                );
              }

              return dataRow;
            });
            const sortedAddedRows = getSortedRows(addedRows, metricIndex);

            newPieRows.push(
              ...sortedAddedRows.map(addedDataRow => {
                const dimensionValue = addedDataRow[dimensionIndex];

                // TODO create common func for creating pieRow objects?
                const color = colors[String(dimensionValue)];
                const key = getKeyFromDimensionValue(dimensionValue);
                const name = formatDimensionValue(dimensionValue);

                return {
                  key,
                  name,
                  originalName: name,
                  color,
                  defaultColor: true,
                  enabled: true,
                  hidden: false,
                };
              }),
            );
          }

          const removedPieRows = removed.map(removedKey => {
            const savedPieRow = keyToSavedPieRow.get(removedKey);
            if (savedPieRow == null) {
              throw Error(
                `Did not find saved pie row for removed key ${removedKey}`,
              );
            }

            return {
              ...savedPieRow,
              hidden: true,
            };
          });
          newPieRows.push(...removedPieRows);

          return newPieRows;
        }

        // TODO move all this to `getDefault`?

        const sortedRows = getSortedAggregatedRows(
          dataRows,
          dimensionIndex,
          metricIndex,
        );

        return sortedRows.map(dataRow => {
          const dimensionValue = dataRow[dimensionIndex];
          const key = getKeyFromDimensionValue(dimensionValue);

          // Older viz settings can have hsl values that need to be converted to
          // hex since Batik does not support hsl.
          const color = Color(
            // Historically we have used the dimension value in the `pie.colors`
            // setting instead of the key computed above, e.g. `null` instead of
            // `(empty)`. For compatibility with existing questions we will
            // continue to use the dimension value.
            colors[String(dimensionValue)],
          ).hex();
          const name = formatDimensionValue(dimensionValue);

          return {
            key,
            name,
            originalName: name,
            color,
            defaultColor: true,
            enabled: true,
          };
        });
      },
      getProps: (
        _rawSeries,
        vizSettings: ComputedVisualizationSettings,
        onChange,
        _extra,
        onChangeSettings,
      ) => {
        return {
          onChangeSeriesColor: (sliceKey: string, color: string) => {
            const pieRows = vizSettings["pie.rows"];
            if (pieRows == null) {
              throw Error("Missing `pie.rows` setting");
            }

            onChange(
              pieRows.map(row => {
                if (row.key !== sliceKey) {
                  return row;
                }
                return { ...row, color, defaultColor: false };
              }),
            );
          },
          onSortEnd: (newPieRows: PieRow[]) =>
            onChangeSettings({
              "pie.sort_rows": false,
              "pie.rows": newPieRows,
            }),
        };
      },
      readDependencies: [
        "pie.dimension",
        "pie.metric",
        "pie.colors",
        "pie.sort_rows",
      ],
    },
    "pie.sort_rows": {
      hidden: true,
      getDefault: () => true, // TODO move to static viz as well
    },
    ...seriesSetting({
      def: {
        widget: SliceNameWidget,
        marginBottom: "0",
        getProps: (
          _series: any,
          vizSettings: ComputedVisualizationSettings,
          _onChange: any,
          _extra: any,
          onChangeSettings: (
            newSettings: ComputedVisualizationSettings,
          ) => void,
        ) => {
          const pieRows = vizSettings["pie.rows"];
          if (pieRows == null) {
            throw Error("Missing `pie.rows` setting");
          }

          return {
            pieRows,
            updateRowName: (newName: string, key: string | number) => {
              onChangeSettings({
                "pie.rows": pieRows.map(row => {
                  if (row.key !== key) {
                    return row;
                  }
                  return { ...row, name: newName };
                }),
              });
            },
          };
        },
      },
      readDependencies: ["pie.rows"],
    }),
    ...metricSetting("pie.metric", {
      section: t`Data`,
      title: t`Measure`,
      showColumnSetting: true,
    }),
    "pie.show_legend": {
      section: t`Display`,
      title: t`Show legend`,
      widget: "toggle",
      getDefault: getDefaultShowLegend,
      inline: true,
      marginBottom: "1rem",
    },
    "pie.show_total": {
      section: t`Display`,
      title: t`Show total`,
      widget: "toggle",
      getDefault: getDefaultShowTotal,
      inline: true,
    },
    "pie.percent_visibility": {
      section: t`Display`,
      title: t`Show percentages`,
      widget: "radio",
      getDefault: getDefaultPercentVisibility,
      props: {
        options: [
          { name: t`Off`, value: "off" },
          { name: t`In legend`, value: "legend" },
          { name: t`On the chart`, value: "inside" },
          { name: t`Both`, value: "both" },
        ],
      },
    },
    "pie.decimal_places": {
      section: t`Display`,
      title: t`Number of decimal places`,
      widget: "number",
      props: {
        placeholder: t`Auto`,
        options: { isInteger: true, isNonNegative: true },
      },
      getHidden: (_, settings) =>
        settings["pie.percent_visibility"] == null ||
        settings["pie.percent_visibility"] === "off",
      readDependencies: ["pie.percent_visibility"],
    },
    "pie.slice_threshold": {
      section: t`Display`,
      title: t`Minimum slice percentage`,
      widget: "number",
      getDefault: getDefaultSliceThreshold,
    },
  } as VisualizationSettingsDefinitions,
};
