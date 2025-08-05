import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { CombineColumns } from "metabase/query_builder/components/expressions";
import { trackColumnCombineViaColumnHeader } from "metabase/querying/analytics";
import { Box, Title } from "metabase/ui";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  question,
  drill,
}) => {
  const DrillPopover = ({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) => {
    const { query, stageIndex, column } = Lib.combineColumnDrillDetails(drill);
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    const availableColumns = Lib.expressionableColumns(query, stageIndex);
    const dispatch = useDispatch();

    return (
      <>
        <Box p="lg" pb={0}>
          <Title
            order={4}
          >{t`Combine “${columnInfo.displayName}” with other columns`}</Title>
        </Box>
        <CombineColumns
          query={query}
          stageIndex={stageIndex}
          availableColumns={availableColumns}
          column={column}
          width={474}
          onSubmit={(name, expressionClause) => {
            const newQuery = Lib.expression(
              query,
              stageIndex,
              name,
              expressionClause,
            );
            const nextQuestion = question.setQuery(newQuery);
            const nextCard = nextQuestion.card();

            trackColumnCombineViaColumnHeader(newQuery, nextQuestion);
            dispatch(setUIControls({ scrollToLastColumn: true }));
            onChangeCardAndRun({ nextCard });
            onClose();
          }}
        />
      </>
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
