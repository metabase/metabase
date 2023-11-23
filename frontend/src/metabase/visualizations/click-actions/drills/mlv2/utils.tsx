import { FilterPickerBody } from "metabase/common/components/FilterPicker";
import type { ClickActionPopoverProps } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

interface FilterPopoverOpts {
  question: Question;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  initialFilter?: Lib.FilterClause;
}

export function getFilterPopover({
  question,
  query,
  column,
  stageIndex,
  initialFilter,
}: FilterPopoverOpts) {
  return function FilterDrillPopover({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) {
    return (
      <FilterPickerBody
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={initialFilter}
        onChange={filter => {
          const nextQuery = Lib.filter(query, stageIndex, filter);
          const nextQuestion = question._setMLv2Query(nextQuery);
          const nextCard = nextQuestion.card();
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
      />
    );
  };
}
