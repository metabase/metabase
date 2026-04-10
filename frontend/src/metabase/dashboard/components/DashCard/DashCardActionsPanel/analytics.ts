import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackVisualizeAnotherWayClicked = () =>
  trackSimpleEvent({
    event: "visualize_another_way_clicked",
    triggered_from: "dashcard-actions-panel",
  });
