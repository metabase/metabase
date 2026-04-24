import { trackSimpleEvent } from "metabase/analytics";

type SMTPSetupEventDetail = "self-hosted" | "cloud";

export function trackSMTPSetupClick({
  eventDetail,
}: {
  eventDetail: SMTPSetupEventDetail;
}) {
  trackSimpleEvent({
    event: "custom_smtp_setup_clicked",
    event_detail: eventDetail,
  });
}

export function trackSMTPSetupSuccess({
  eventDetail,
}: {
  eventDetail: SMTPSetupEventDetail;
}) {
  trackSimpleEvent({
    event: "custom_smtp_setup_success",
    event_detail: eventDetail,
  });
}
