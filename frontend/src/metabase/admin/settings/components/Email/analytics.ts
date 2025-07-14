import { trackSimpleEvent } from "metabase/lib/analytics";
import type {
  CustomSMTPSetupClickedEvent,
  CustomSMTPSetupSuccessEvent,
} from "metabase-types/analytics";

export function trackSMTPSetupClick({
  eventDetail,
}: {
  eventDetail: CustomSMTPSetupClickedEvent["event_detail"];
}) {
  trackSimpleEvent({
    event: "custom_smtp_setup_clicked",
    event_detail: eventDetail,
  });
}

export function trackSMTPSetupSuccess({
  eventDetail,
}: {
  eventDetail: CustomSMTPSetupSuccessEvent["event_detail"];
}) {
  trackSimpleEvent({
    event: "custom_smtp_setup_success",
    event_detail: eventDetail,
  });
}
