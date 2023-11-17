import { t } from "ttag";
import type { Drill } from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import { FilterPickerBody } from "metabase/common/components/FilterPicker";

export const ColumnFilterDrill: Drill<Lib.ColumnFilterDrillThruInfo> = ({
  question,
  drill,
}) => {
  if (!drill) {
    return [];
  }

  const query = question._getMLv2Query();
  const drillColumn = Lib.drillThruColumn(drill);
  const filterableColumns = Lib.filterableColumns(query, -1);
  const filterColumn = Lib.findMatchingColumn(
    query,
    -1,
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
            stageIndex={-1}
            column={filterColumn}
            onChange={filter => {
              const nextQuery = Lib.filter(query, -1, filter);
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
