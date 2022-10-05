import { t } from "ttag";
import {
  canZoomDrill,
  zoomDrillQuestion,
} from "metabase-lib/lib/queries/drills/zoom-drill";

export default ({ question, clicked }) => {
  if (!canZoomDrill({ question, clicked })) {
    return [];
  }

  return [
    {
      name: "timeseries-zoom",
      section: "zoom",
      title: t`Zoom in`,
      buttonType: "horizontal",
      icon: "zoom_in",
      question: () => zoomDrillQuestion({ question, clicked }),
    },
  ];
};
