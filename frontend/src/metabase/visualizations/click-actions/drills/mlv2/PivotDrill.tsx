import { t } from "ttag";
import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionBase,
  ClickActionPopoverProps,
  Drill,
  PopoverClickAction,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

const DEFAULT_ACTION: ClickActionBase = {
  name: "breakout-by",
  section: "breakout",
  buttonType: "horizontal",
};

export const PivotDrill: Drill = ({ drill, applyDrill }) => {
  if (!drill) {
    return [];
  }

  const clickActions: PopoverClickAction[] = [];
  const { query, columns } = Lib.pivotDrillDetails(drill);
  const categoryColumns = columns.filter(Lib.isCategory);
  const locationColumns = columns.filter(Lib.isLocation);
  const dateColumns = columns.filter(Lib.isDate);

  if (categoryColumns.length > 0) {
    clickActions.push({
      ...DEFAULT_ACTION,
      name: "pivot-by-category",
      title: t`Category`,
      icon: "string",
      popover: getColumnPopover(query, categoryColumns, drill, applyDrill),
    });
  }

  if (locationColumns.length > 0) {
    clickActions.push({
      ...DEFAULT_ACTION,
      name: "pivot-by-location",
      title: t`Location`,
      icon: "location",
      popover: getColumnPopover(query, locationColumns, drill, applyDrill),
    });
  }

  if (dateColumns.length > 0) {
    clickActions.push({
      ...DEFAULT_ACTION,
      name: "pivot-by-time",
      title: t`Time`,
      icon: "calendar",
      popover: getColumnPopover(query, dateColumns, drill, applyDrill),
    });
  }

  const PivotPopover = ({ onClick }: ClickActionPopoverProps) => {
    return <ClickActionsView clickActions={clickActions} onClick={onClick} />;
  };

  return [
    {
      ...DEFAULT_ACTION,
      icon: "arrow_split",
      title: t`Break out by…`,
      popover: clickActions.length > 1 ? PivotPopover : clickActions[0].popover,
    },
  ];
};

function getColumnPopover(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  drill: Lib.DrillThru,
  applyDrill: (drill: Lib.DrillThru, column: Lib.ColumnMetadata) => Question,
) {
  return function PivotColumnPopover({
    onChangeCardAndRun,
    onClose,
  }: ClickActionPopoverProps) {
    return (
      <QueryColumnPicker
        query={query}
        stageIndex={-1}
        columnGroups={Lib.groupColumns(columns)}
        checkIsColumnSelected={() => false}
        onSelect={column => {
          const nextQuestion = applyDrill(drill, column).setDefaultDisplay();
          const nextCard = nextQuestion.card();
          onChangeCardAndRun({ nextCard });
        }}
        onClose={onClose}
      />
    );
  };
}
