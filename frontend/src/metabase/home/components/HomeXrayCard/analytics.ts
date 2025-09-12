import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackHomeXRayClicked = () => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    triggered_from: "homepage",
  });
};
