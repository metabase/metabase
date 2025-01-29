import { t } from "ttag";
import _ from "underscore";

import type { LegacyDrill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { findColumnSettingIndexesForColumns } from "metabase-lib/v1/queries/utils/dataset";

export const HideColumnAction: LegacyDrill = ({
  question,
  clicked,
  settings,
}) => {
  // HACK: we should pass column's question instance to this function
  const isVisualizer = _.isEqual(Object.keys(question.card()), [
    "display",
    "visualization_settings",
  ]);

  let isEditable = true;
  if (!isVisualizer) {
    isEditable = Lib.queryDisplayInfo(question.query()).isEditable;
  }

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.column ||
    clicked?.extraData?.isRawTable ||
    !isEditable
  ) {
    return [];
  }

  const { column } = clicked;

  return [
    {
      name: "formatting-hide",
      title: t`Hide column`,
      section: "sort",
      buttonType: "sort",
      icon: "eye_crossed_out",
      tooltip: t`Hide column`,
      default: true,
      question: () => {
        const columnSettings = settings?.["table.columns"] ?? [];
        const [columnSettingIndex] = findColumnSettingIndexesForColumns(
          [column],
          columnSettings,
        );

        const columnSettingsCopy = [...columnSettings];
        if (columnSettingIndex >= 0) {
          columnSettingsCopy[columnSettingIndex] = {
            ...columnSettingsCopy[columnSettingIndex],
            enabled: false,
          };
        }

        return question.updateSettings({ "table.columns": columnSettingsCopy });
      },
      questionChangeBehavior: "updateQuestion",
    },
  ];
};
