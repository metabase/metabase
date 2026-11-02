import { trackSimpleEvent } from "metabase/analytics";
import type { HealthCheckId } from "metabase-types/api";

export const trackSecurityCenterPageViewed = () => {
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

export const trackHealthCheckRecheckClicked = (checkId: HealthCheckId) => {
  trackSimpleEvent({
    event: "security_center_health_check_recheck_clicked",
    event_detail: checkId,
  });
};

export const trackAllHealthChecksRecheckClicked = () => {
  trackSimpleEvent({
    event: "security_center_health_check_recheck_clicked",
    event_detail: "all",
  });
};
