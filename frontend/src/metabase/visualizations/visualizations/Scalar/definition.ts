import { t } from "ttag";
import _ from "underscore";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type { DatasetData } from "metabase-types/api/dataset";

export const SCALAR_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Number`,
  identifier: "scalar",
  iconName: "number",
  canSavePng: false,

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
      getWrapperStyle: () => ({
        marginLeft: 0,
        marginRight: 0,
      }),
      getProps: () => ({
        canRemoveAll: true,
      }),
    },
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0],
      ],
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
