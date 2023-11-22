import { t } from "ttag";
import type { IconName } from "metabase/core/components/Icon";
import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  PopoverClickAction,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

type ClickActionCategory = {
  name: string;
  title: string;
  icon: IconName;
  match: (column: Lib.ColumnMetadata) => boolean;
};

const CATEGORIES: ClickActionCategory[] = [
  {
    name: "pivot-by-category",
    title: t`Category`,
    icon: "string",
    match: Lib.isCategory,
  },
  {
    name: "pivot-by-location",
    title: t`Location`,
    icon: "location",
    match: Lib.isLocation,
  },
  {
    name: "pivot-by-time",
    title: t`Time`,
    icon: "calendar",
    match: Lib.isTime,
  },
];

export const PivotDrill: Drill = ({ drill, applyDrill }) => {
  const drillDetails = Lib.pivotDrillDetails(drill);

  const actions = CATEGORIES.flatMap(category => {
    const action = getAction(drill, drillDetails, category, applyDrill);
    return action ? [action] : [];
  });

  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
    return <ClickActionsView clickActions={actions} onClick={onClick} />;
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

function getAction(
  drill: Lib.DrillThru,
  { query, stageIndex, columns }: Lib.PivotDrillDetails,
  category: ClickActionCategory,
  applyDrill: (drill: Lib.DrillThru, column: Lib.ColumnMetadata) => Question,
): PopoverClickAction | undefined {
  const matchingColumns = columns.filter(category.match);
  if (matchingColumns.length === 0) {
    return;
  }

  return {
    ...category,
    section: "breakout",
    buttonType: "horizontal",
    popover: getColumnPopover(
      query,
      stageIndex,
      matchingColumns,
      drill,
      applyDrill,
    ),
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
    );
  };
}
