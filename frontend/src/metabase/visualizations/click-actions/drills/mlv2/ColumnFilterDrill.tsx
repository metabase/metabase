import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import { FilterPickerBody } from "metabase/common/components/FilterPicker";

const STAGE_INDEX = -1;

export const ColumnFilterDrill: Drill<Lib.ColumnFilterDrillThruInfo> = ({
  question,
  drill,
}) => {
  if (!drill) {
    return [];
  }

  return [
    {
      name: "filter-column",
      section: "summarize",
      title: t`Filter by this column`,
      buttonType: "horizontal",
      icon: "filter",
      popover: ({ onChangeCardAndRun, onClose }) => {
        const { query, column } = Lib.columnFilterDrillDetails(drill);

        return (
          <FilterPickerBody
            query={query}
            stageIndex={STAGE_INDEX}
            column={column}
            onChange={filter => {
              const nextQuery = Lib.filter(query, STAGE_INDEX, filter);
              const nextQuestion = question._setMLv2Query(nextQuery);
              const nextCard = nextQuestion.card();
              onChangeCardAndRun({ nextCard });
              onClose();
            }}
          />
        );
      },
    },
  ];
};
