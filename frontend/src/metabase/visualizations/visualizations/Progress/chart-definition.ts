import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { ChartSettingGoalInput } from "metabase/visualizations/components/settings/ChartSettingGoalInput";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

import { findProgressColumn } from "./utils";

export const PROGRESS_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Progress`,
  identifier: "progress",
  iconName: "progress",
  minSize: getMinSize("progress"),
  defaultSize: getDefaultSize("progress"),
  isSensible: ({ cols, rows }) => {
    return rows.length === 1 && cols.filter(isNumeric).length >= 1;
  },
  checkRenderable: ([
    {
      data: { cols },
    },
  ]) => {
    if (!cols.some(isNumeric)) {
      throw new Error(
        t`Progress visualization requires at least one numeric column.`,
      );
    }
  },
  settings: {
    ...fieldSetting("progress.value", {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Value`;
      },
      fieldFilter: isNumeric,
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols.find(isNumeric)?.name || cols[0]?.name,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.filter(isNumeric).length <= 1,
    }),
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => {
        const valueField = settings["progress.value"];
        const column = findProgressColumn(cols, valueField);
        return [column || cols[0]];
      },
      readDependencies: ["progress.value"],
    }),
    "progress.goal": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Goal`;
      },
      widget: ChartSettingGoalInput,
      default: 0,
      isValid: ([{ data }], settings) => {
        const goalSetting = settings["progress.goal"];

        if (typeof goalSetting === "number") {
          return true;
        }

        if (typeof goalSetting === "string") {
          const column = data.cols.find((col) => col.name === goalSetting);
          return !!(column && isNumeric(column));
        }

        return false;
      },
      getProps: ([{ data }], settings) => ({
        columns: data.cols,
        valueField: settings["progress.value"],
      }),
      readDependencies: ["progress.value"],
    },
    "progress.color": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Color`;
      },
      widget: "color",
      default: color("accent1"),
    },
  } as VisualizationSettingsDefinitions,
};
