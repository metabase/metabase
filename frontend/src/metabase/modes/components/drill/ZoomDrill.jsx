import { t } from "ttag";
import {
  zoomDrill,
  zoomDrillQuestion,
} from "metabase-lib/queries/drills/zoom-drill";

export default ({ question, clicked }) => {
  if (!zoomDrill({ question, clicked })) {
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
