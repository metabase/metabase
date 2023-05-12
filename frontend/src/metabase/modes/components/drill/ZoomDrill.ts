import type {
  ClickActionProps,
  QuestionChangeClickAction,
} from "metabase/modes/types";
import {
  getNextZoomDrilldown,
  getZoomDrillTitle,
  zoomDrillQuestion,
} from "metabase-lib/queries/drills/zoom-drill";

const ZoomDrill = ({
  question,
  clicked,
}: ClickActionProps): QuestionChangeClickAction[] => {
  const result = getNextZoomDrilldown(question, clicked);

  if (!result) {
    return [];
  }

  const { dimensions, drilldown } = result;

  return [
    {
      name: "timeseries-zoom",
      title: getZoomDrillTitle(dimensions, drilldown),
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => zoomDrillQuestion(question, dimensions, drilldown),
    },
  ];
};

export default ZoomDrill;
