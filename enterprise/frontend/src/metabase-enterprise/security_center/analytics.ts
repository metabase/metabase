import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackSecurityCenterPageViewed = () => {
  trackSimpleEvent({
    event: "security_center_page_viewed",
  });
};
