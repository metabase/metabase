import { t } from "ttag";
import {
  zoomDrill,
  zoomDrillQuestion,
} from "metabase-lib/queries/drills/zoom-drill";
import type { Drill } from "../../types";

const ZoomDrill: Drill = ({ question, clicked }) => {
  if (!zoomDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "timeseries-zoom",
      title: t`Zoom in`,
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => zoomDrillQuestion({ question, clicked }),
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ZoomDrill;
