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
        subTitle: getExample(extraction),
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

export function getExample(info: Lib.ColumnExtractionInfo) {
  /**
   * @todo this should eventually be moved into Lib.displayInfo
   * to avoid the keys going out of sync with the MLv2-defined extractions.
   */
  switch (info.tag) {
    case "hour-of-day":
      return "0, 1";
    case "day-of-month":
      return "1, 2";
    case "day-of-week":
      return "Monday, Tuesday";
    case "month-of-year":
      return "Jan, Feb";
    case "quarter-of-year":
      return "Q1, Q2";
    case "year":
      return "2023, 2024";
    case "domain":
      return "example, online";
    case "host":
      return "example.com, online.com";
    case "subdomain":
      return "www, maps";
  }

  return undefined;
}
