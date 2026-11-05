import { trackSimpleEvent } from "metabase/analytics";

export const trackAdvisoriesPageViewed = () => {
  trackSimpleEvent({
    event: "security_center_page_viewed",
  });
};

export const trackSecurityAdvisoryDownloadClicked = () => {
  trackSimpleEvent({
    event: "security_advisory_download_clicked",
  });
};

export const trackHealthChecksPageViewed = () => {
  trackSimpleEvent({
    event: "security_center_health_checks_page_viewed",
  });
};

export const trackHealthChecksRecheckClicked = () => {
  trackSimpleEvent({
    event: "security_center_health_check_recheck_clicked",
  });
};
