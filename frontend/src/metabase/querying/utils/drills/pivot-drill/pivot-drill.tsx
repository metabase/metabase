import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Box } from "metabase/ui";
import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  PopoverClickAction,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

const ACTIONS = {
  category: {
    name: "pivot.category",
    title: t`Category`,
    icon: "string",
  },
  location: {
    name: "pivot.location",
    title: t`Location`,
    icon: "location",
  },
  time: {
    name: "pivot.time",
    title: t`Time`,
    icon: "calendar",
  },
} as const;

export const pivotDrill: Drill = ({ query, stageIndex, drill, applyDrill }) => {
  const pivotTypes = Lib.pivotTypes(drill);

  const actions = pivotTypes.map(pivotType =>
    getActionForType(query, stageIndex, drill, pivotType, applyDrill),
  );

  const DrillPopover = ({ onClick, onClose }: ClickActionPopoverProps) => {
    return (
      <ClickActionsView
        clickActions={actions}
        close={onClose}
        onClick={onClick}
      />
    );
  };

  return [
    {
      name: "breakout-by",
      title: t`Break out by…`,
      section: "breakout",
      icon: "arrow_split",
      buttonType: "horizontal",
      popover: actions.length > 1 ? DrillPopover : actions[0].popover,
    },
  ];
};

function getActionForType(
  query: Lib.Query,
  stageIndex: number,
  drill: Lib.DrillThru,
  pivotType: Lib.PivotType,
  applyDrill: (drill: Lib.DrillThru, column: Lib.ColumnMetadata) => Question,
): PopoverClickAction {
  const columns = Lib.pivotColumnsForType(drill, pivotType);

  return {
    ...ACTIONS[pivotType],
    section: "breakout",
    buttonType: "horizontal",
    popover: getColumnPopover(query, stageIndex, columns, drill, applyDrill),
  };
}

function getColumnPopover(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  drill: Lib.DrillThru,
  applyDrill: (drill: Lib.DrillThru, column: Lib.ColumnMetadata) => Question,
) {
  return function DrillColumnPopover({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) {
    return (
      <Box mah="65vh">
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={Lib.groupColumns(columns)}
          checkIsColumnSelected={() => false}
          onSelect={column => {
            const nextQuestion = applyDrill(drill, column).setDefaultDisplay();
            const nextCard = nextQuestion.card();
            onChangeCardAndRun({ nextCard });
          }}
          onClose={onClose}
        />
      </Box>
    );
  };
}
