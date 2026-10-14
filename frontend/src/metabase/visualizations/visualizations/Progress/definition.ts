import { t } from "ttag";

import { color } from "metabase/ui/colors";
import {
  type VisualizationDefinition,
  columnSettings,
  fieldSetting,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import { isGoalSelfColumnRef, isGoalValue } from "metabase-types/guards";

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
      getSection: () => t`Display`,
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
      getSection: () => t`Display`,
      get title() {
        return t`Goal`;
      },
      widget: "goalValue",
      getDefault: () => 0,
      isValid: ([{ data }], settings) => {
        const goalSetting = settings["progress.goal"];

        if (isGoalSelfColumnRef(goalSetting)) {
          const column = data.cols.find((col) => col.name === goalSetting);
          return !!(column && isNumeric(column));
        }

        return isGoalValue(goalSetting);
      },
      getProps: ([{ card, data }], settings) => {
        const column = findProgressColumn(
          data.cols,
          settings["progress.value"],
        );

        return {
          data,
          datasetQuery: card.dataset_query,
          excludedSelfColumn: settings["progress.value"],
          formatOptions: column && settings.column?.(column),
          placeholder: t`Enter goal value`,
        };
      },
      readDependencies: ["progress.value"],
    },
    "progress.color": {
      getSection: () => t`Display`,
      get title() {
        return t`Color`;
      },
      widget: "color",
      getDefault: () => color("accent1"),
    },
  },
};
