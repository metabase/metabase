import { trackSimpleEvent } from "metabase/analytics";

export const trackSecurityCenterPageViewed = () => {
  trackSimpleEvent({
    event: "security_center_page_viewed",
  });
};
