import { trackSimpleEvent } from "metabase/lib/analytics";
import type {
  ErrorDiagnosticModalOpenedEvent,
  ErrorDiagnosticModalSubmittedEvent,
} from "metabase-types/analytics/event";

export const trackErrorDiagnosticModalOpened = (
  triggeredFrom: ErrorDiagnosticModalOpenedEvent["triggered_from"],
) => {
  trackSimpleEvent({
    event: "error_diagnostic_modal_opened",
    triggered_from: triggeredFrom,
  });
};

export const trackErrorDiagnosticModalSubmitted = (
  eventDetail: ErrorDiagnosticModalSubmittedEvent["event_detail"],
) => {
  trackSimpleEvent({
    event: "error_diagnostic_modal_submitted",
    event_detail: eventDetail,
  });
};
