import { trackSimpleEvent } from "metabase/analytics";

export const trackPublicLinkPasswordSet = (
  entityType: "card" | "dashboard",
) => {
  trackSimpleEvent({
    event: "public_link_password_set",
    event_detail: entityType,
  });
};

export const trackPublicLinkPasswordRemoved = (
  entityType: "card" | "dashboard",
) => {
  trackSimpleEvent({
    event: "public_link_password_removed",
    event_detail: entityType,
  });
};
