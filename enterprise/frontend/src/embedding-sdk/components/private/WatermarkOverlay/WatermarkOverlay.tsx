import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Overlay } from "metabase/ui";

import WatermarkOverlayS from "./WatermarkOverlay.module.css";

export const WatermarkOverlay = () => {
  return (
    <Overlay
      radius="md"
      className={cx(CS.pointerEventsNone, WatermarkOverlayS.watermarkOverlay)}
    />
  );
};
