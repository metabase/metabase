import { t } from "ttag";

import { onUpdateVisualizationSettings } from "metabase/query_builder/actions";
import type { LegacyDrill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { findColumnSettingIndexesForColumns } from "metabase-lib/v1/queries/utils/dataset";

export const HideColumnAction: LegacyDrill = ({
  question,
  clicked,
  settings,
}) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());

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
      action: () => {
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

        return onUpdateVisualizationSettings({
          "table.columns": columnSettingsCopy,
        });
      },
    },
  ];
};
