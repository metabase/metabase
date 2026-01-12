import { trackSimpleEvent } from "metabase/lib/analytics";
import type { RelatedDashboardXRays } from "metabase-types/api";

export const trackSuggestedXRayClicked = (
  action: keyof RelatedDashboardXRays,
) => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    event_detail: action,
    triggered_from: "suggestion_sidebar",
  });
};

export const trackXRaySaved = () => {
  trackSimpleEvent({
    event: "x-ray_saved",
  });
};
