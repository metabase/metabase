import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackSuggestedXRayClicked = () => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    triggered_from: "suggestion_sidebar",
  });
};

export const trackXRaySaved = () => {
  trackSimpleEvent({
    event: "x-ray_saved",
  });
};
