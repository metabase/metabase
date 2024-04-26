import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  RegularClickAction,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const columnExtractDrill: Drill<Lib.ColumnExtractDrillThruInfo> = ({
  drill,
  drillInfo,
  clicked,
  applyDrill,
}) => {
  const DrillPopover = ({ onClose, onClick }: ClickActionPopoverProps) => {
    const actions: RegularClickAction[] = drillInfo.extractions.map(
      extraction => ({
        name: `extract.${extraction.displayName}`,
        title: extraction.displayName,
        section: "extract-popover",
        buttonType: "horizontal",
        question: () => applyDrill(drill, extraction.tag),
        extra: () => ({ settingsSyncOptions: { column: clicked.column } }),
      }),
    );

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
      name: "extract",
      title: drillInfo.displayName,
      section: "extract",
      icon: "extract",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
