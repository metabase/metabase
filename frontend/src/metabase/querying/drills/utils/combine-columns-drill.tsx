import { t } from "ttag";

import { setUIControls } from "metabase/redux/query-builder";
import { Box, Title } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

import { trackColumnCombineViaColumnHeader } from "../../analytics";
import { CombineColumns } from "../../components/expressions";

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
