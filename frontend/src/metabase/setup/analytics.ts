import type { UsageReason } from "metabase-types/api";
import { trackSchemaEvent } from "metabase/lib/analytics";

const ONBOARDING_VERSION = "1.1.0";
const SCHEMA_VERSION = "1-0-1";

// TODO: make it accept {stepName, stepNumber} instead of just step
export const trackStepSeen = (step: any) => {
  trackSchemaEvent("setup", SCHEMA_VERSION, {
    event: "step_seen",
    version: "1.0.0",
    step: step, // TODO: will be fixed with the todo above
    step_number: step,
  });
};

export const trackUsageReasonSelected = (usageReason: UsageReason) => {
  trackSchemaEvent("setup", SCHEMA_VERSION, {
    event: "usage_reason_selected",
    version: ONBOARDING_VERSION,
    usage_reason: usageReason,
  });
};

export const trackDatabaseSelected = (engine: string) => {
  trackSchemaEvent("setup", SCHEMA_VERSION, {
    event: "database_selected",
    version: ONBOARDING_VERSION,
    database: engine,
  });
};

export const trackAddDataLaterClicked = (engine?: string) => {
  trackSchemaEvent("setup", SCHEMA_VERSION, {
    event: "add_data_later_clicked",
    version: ONBOARDING_VERSION,
    source: engine ? "post_selection" : "pre_selection",
  });
};

export const trackTrackingChanged = (isTrackingAllowed: boolean) => {
  trackSchemaEvent("settings", SCHEMA_VERSION, {
    event: isTrackingAllowed
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "setup",
  });
};
