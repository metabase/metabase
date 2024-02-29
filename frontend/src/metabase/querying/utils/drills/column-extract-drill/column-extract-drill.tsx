import { t } from "ttag";

import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  RegularClickAction,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

export const columnExtractDrill: Drill<Lib.ColumnExtractDrillThruInfo> = ({
  query,
  stageIndex,
  drill,
  applyDrill,
}) => {
  const types = Lib.columnExtractTypes(drill);

  if (types.length === 0) {
    return [];
  }

  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
    const actions = types.map(type => {
      return getActionForType(query, stageIndex, drill, type, applyDrill);
    });

    return <ClickActionsView clickActions={actions} onClick={onClick} />;
  };

  return [
    {
      name: "extract",
      title: t`Extract day, month…`,
      section: "extract",
      icon: "extract",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};

const getActionForType = (
  query: Lib.Query,
  stageIndex: number,
  drill: Lib.DrillThru,
  type: Lib.ColumnExtractType,
  applyDrill: (drill: Lib.DrillThru, type: Lib.ColumnExtractType) => Question,
): RegularClickAction => {
  const { displayName } = Lib.displayInfo(query, stageIndex, type);

  return {
    name: `extract.${displayName}`,
    title: displayName,
    section: "extract-popover",
    buttonType: "horizontal",
    question: () => applyDrill(drill, type),
  };
};
