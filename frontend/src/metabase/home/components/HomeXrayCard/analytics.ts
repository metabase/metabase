import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackHomeXRayClicked = () => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    event_detail: "table",
    triggered_from: "homepage",
  });
};
