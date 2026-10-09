import { t } from "ttag";
import _ from "underscore";

import {
  type VisualizationDefinition,
  columnSettings,
  fieldSetting,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

export const SCALAR_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Number`,
  identifier: "scalar",
  iconName: "number",
  canSavePng: false,
  noHeader: true,
  noLoadingHeader: true,

  minSize: getMinSize("scalar"),
  defaultSize: getDefaultSize("scalar"),

  isSensible({ cols, rows }: DatasetData) {
    return rows.length === 1 && cols.length === 1;
  },

  checkRenderable() {
    // scalar can always be rendered, nothing needed here
  },

  settings: {
    ...fieldSetting("scalar.field", {
      getSection: () => t`Formatting`,
      get title() {
        return t`Field to show`;
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols[0]?.name,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.length < 2,
    }),
    "scalar.segments": {
      getSection: () => t`Conditional colors`,
      getDefault() {
        return [];
      },
      widget: "segmentsEditor",
      persistDefault: true,
      getProps: ([{ card, data }], settings) => {
        const column = findScalarColumn(data.cols, settings);

        return {
          canRemoveAll: true,
          data,
          datasetQuery: card.dataset_query,
          formatOptions: column && settings.column?.(column),
        };
      },
    },
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [findScalarColumn(cols, settings)],
      readDependencies: ["scalar.field"],
    }),
    // used by metrics viewer
    "scalar.label": {
      getHidden: () => true,
      getDefault: () => undefined,
    },
    // used by metrics viewer
    "scalar.sublabel": {
      getHidden: () => true,
      getDefault: () => undefined,
    },
    // LEGACY scalar settings, now handled by column level settings
    "scalar.locale": {
      // title: t`Separator style`,
      // widget: "select",
      // getProps: () => ({
      //   options: [
      //     { name: "100000.00", value: null },
      //     { name: "100,000.00", value: "en" },
      //     { name: "100 000,00", value: "fr" },
      //     { name: "100.000,00", value: "de" },
      //   ],
      // }),
      // getDefault:() => "en",
    },
    "scalar.decimals": {
      // title: t`Number of decimal places`,
      // widget: "number",
    },
    "scalar.prefix": {
      // title: t`Add a prefix`,
      // widget: "input",
    },
    "scalar.suffix": {
      // title: t`Add a suffix`,
      // widget: "input",
    },
    "scalar.scale": {
      // title: t`Multiply by a number`,
      // widget: "number",
    },
    click_behavior: {},
  },
};

function findScalarColumn(
  cols: DatasetColumn[],
  settings: VisualizationSettings,
): DatasetColumn {
  return (
    _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0]
  );
}
