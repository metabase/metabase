import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { hasCombinations } from "metabase/query_builder/components/expressions/CombineColumns";
import { trackColumnCombineViaColumnHeader } from "metabase/querying/analytics";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

import { CombineColumnsDrill } from "./components";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  question,
  query: originalQuery,
  stageIndex: originalStageIndex,
  clicked,
}) => {
  const { query, stageIndex } = Lib.asReturned(
    originalQuery,
    originalStageIndex,
  );

  if (!clicked.column || !hasCombinations(query, stageIndex)) {
    return [];
  }

  const column = Lib.fromLegacyColumn(query, stageIndex, clicked.column);

  const DrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();
    return (
      <CombineColumnsDrill
        column={column}
        query={query}
        stageIndex={stageIndex}
        onSubmit={newQuery => {
          const nextQuestion = question.setQuery(newQuery);
          const nextCard = nextQuestion.card();

          trackColumnCombineViaColumnHeader(newQuery, nextQuestion);
          dispatch(setUIControls({ scrollToLastColumn: true }));
          onChangeCardAndRun({ nextCard });
          onClose();
        }}
      />
    );
  };

  return [
    {
      name: "combine",
      title: t`Combine columns`,
      section: "combine",
      icon: "combine",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
