import { trackSimpleEvent } from "metabase/analytics";

export const trackVersionRevertClicked = (
  entity: "card" | "dashboard" | "document" | "transform",
) => {
  trackSimpleEvent({
    event: "revert_version_clicked",
    event_detail: entity,
  });
};
