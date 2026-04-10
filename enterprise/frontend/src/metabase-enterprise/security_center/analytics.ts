import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackSecurityCenterPageViewed = () => {
  trackSimpleEvent({
    event: "security_center_page_viewed",
  });
};
