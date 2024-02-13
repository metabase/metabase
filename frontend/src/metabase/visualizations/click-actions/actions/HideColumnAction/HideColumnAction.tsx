import { t } from "ttag";
import type { LegacyDrill } from "metabase/visualizations/types";
import { onUpdateVisualizationSettings } from "metabase/query_builder/actions";
import {
  findColumnSettingIndex,
  getColumnSettingsWithRefs,
} from "metabase/visualizations/components/settings/ChartSettingTableColumns/utils";

export const HideColumnAction: LegacyDrill = ({
  question,
  clicked,
  settings,
}) => {
  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.column ||
    clicked?.extraData?.isRawTable ||
    !question.isQueryEditable()
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
        const columnSettings = getColumnSettingsWithRefs(
          settings?.["table.columns"] || [],
        );
        const query = question.query();

        const columnSettingIndex = findColumnSettingIndex(
          query,
          column,
          columnSettings,
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
