import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { trackColumnExtractViaHeader } from "metabase/querying/analytics";
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
  question,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const DrillPopover = ({ onClose, onClick }: ClickActionPopoverProps) => {
    const dispatch = useDispatch();
    const extractions = Lib.extractionsForDrill(drill);

    const actions: RegularClickAction[] = drillInfo.extractions.map(
      (extraction, index) => ({
        name: `extract.${extraction.displayName}`,
        title: extraction.displayName,
        subTitle: Lib.getExtractionExample(extraction),
        section: "extract-popover",
        buttonType: "horizontal",
        question: () => applyDrill(drill, extraction.tag),
        extra: () => ({
          extraction: extractions[index],
        }),
      }),
    );

    function handleClick(action: RegularClickAction) {
      const { extraction } = action.extra?.() as {
        extraction: Lib.ColumnExtraction;
      };

      trackColumnExtractViaHeader(query, stageIndex, extraction, question);
      dispatch(setUIControls({ scrollToLastColumn: true }));
      onClick(action);
    }

    return (
      <ClickActionsView
        clickActions={actions}
        close={onClose}
        onClick={handleClick}
      />
    );
  };

  return [
    {
      name: "extract",
      title: drillInfo.displayName,
      section: "extract",
      icon: "arrow_split",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
