import { FilterPickerBody } from "metabase/common/components/FilterPicker";
import type { ClickActionPopoverProps } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

const STAGE_INDEX = -1;

interface FilterPopoverOpts {
  question: Question;
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  initialFilter?: Lib.FilterClause;
}

export function getFilterPopover({
  question,
  query,
  column,
  initialFilter,
}: FilterPopoverOpts) {
  return function DrillPopover({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) {
    return (
      <FilterPickerBody
        query={query}
        stageIndex={STAGE_INDEX}
        column={column}
        filter={initialFilter}
        onChange={filter => {
          const nextQuery = Lib.filter(query, STAGE_INDEX, filter);
          const nextQuestion = question._setMLv2Query(nextQuery);
          const nextCard = nextQuestion.card();
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
      />
    );
  };
}
