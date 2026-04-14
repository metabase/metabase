import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackVersionRevertClicked = (
  entity: "card" | "dashboard" | "document" | "transform",
) => {
  trackSimpleEvent({
    event: "revert_version_clicked",
    event_detail: entity,
  });
};
