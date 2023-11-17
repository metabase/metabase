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

  const query = question._getMLv2Query();
  const drillColumn = Lib.drillThruColumn(drill);
  const filterableColumns = Lib.filterableColumns(query, STAGE_INDEX);
  const filterColumn = Lib.findMatchingColumn(
    query,
    STAGE_INDEX,
    drillColumn,
    filterableColumns,
  );
  if (!filterColumn) {
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
        return (
          <FilterPickerBody
            query={query}
            stageIndex={STAGE_INDEX}
            column={filterColumn}
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
