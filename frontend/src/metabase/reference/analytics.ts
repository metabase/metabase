import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackReferenceXRayClicked = (
  source: "table" | "field" | "segment",
) => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    event_detail: source,
    triggered_from: "data_reference",
  });
};
