import { trackSimpleEvent } from "metabase/analytics";

export const trackCustomVizSelected = () => {
  trackSimpleEvent({ event: "custom_viz_selected" });
};
