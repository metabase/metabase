import { t } from "ttag";

import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  RegularClickAction,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

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

  const actions: RegularClickAction[] = types.map(type => {
    const { displayName } = Lib.displayInfo(query, stageIndex, type);

    return {
      name: "automatic-insights.xray",
      title: displayName,
      section: "auto-popover",
      buttonType: "horizontal",
      question: () => applyDrill(drill, type),
    };
  });

  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
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
