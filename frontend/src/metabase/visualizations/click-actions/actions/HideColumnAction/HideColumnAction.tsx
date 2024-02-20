import { t } from "ttag";

import { onUpdateVisualizationSettings } from "metabase/query_builder/actions";
import type { LegacyDrill } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

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
        const columnSettingsCopy = [...columnSettings];
        const query = question.query();
        const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
          query,
          -1,
          [column],
          columnSettings.map(setting => setting.fieldRef),
        );
        const columnSettingIndex = columnIndexes.findIndex(
          columnIndex => columnIndex >= 0,
        );

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
