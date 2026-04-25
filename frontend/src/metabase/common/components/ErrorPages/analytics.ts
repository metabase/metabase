import { trackSimpleEvent } from "metabase/analytics";

export const trackErrorDiagnosticModalOpened = (
  triggeredFrom: "profile-menu" | "command-palette",
) => {
  trackSimpleEvent({
    event: "error_diagnostic_modal_opened",
    triggered_from: triggeredFrom,
  });
};

export const trackErrorDiagnosticModalSubmitted = (
  eventDetail: "download-diagnostics" | "submit-report",
) => {
  trackSimpleEvent({
    event: "error_diagnostic_modal_submitted",
    event_detail: eventDetail,
  });
};
