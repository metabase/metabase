import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackVisualizeAnotherWayClicked = () =>
  trackSimpleEvent({
    event: "visualize_another_way_clicked",
    triggered_from: "question-list",
  });
