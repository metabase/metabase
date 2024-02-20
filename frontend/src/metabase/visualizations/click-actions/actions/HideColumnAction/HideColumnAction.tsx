import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { LegacyDrill } from "metabase/visualizations/types";
import { onUpdateVisualizationSettings } from "metabase/query_builder/actions";

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
        const query = question.query();

        const [columnSettingIndex] = Lib.findColumnIndexesFromLegacyRefs(
          query,
          -1,
          [column],
          columnSettings.map(setting => setting.fieldRef),
        );

        const columnSettingsCopy = [...columnSettings];
        if (columnSettingIndex !== -1) {
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
