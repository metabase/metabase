import { trackSchemaEvent } from "metabase/lib/analytics";
import { STEPS } from "./constants";

export const trackStepSeen = (step: number) => {
  trackSchemaEvent("setup", "1-0-1", {
    event: "step_seen",
    version: "1.0.0",
    step: STEPS[step],
    step_number: step,
  });
};

export const trackDatabaseSelected = (engine: string) => {
  trackSchemaEvent("setup", "1-0-1", {
    event: "database_selected",
    version: "1.0.0",
    database: engine,
  });
};

export const trackAddDataLaterClicked = (engine?: string) => {
  trackSchemaEvent("setup", "1-0-1", {
    event: "add_data_later_clicked",
    version: "1.0.0",
    source: engine ? "post_selection" : "pre_selection",
  });
};

export const trackTrackingChanged = (isAllowed: boolean) => {
  trackSchemaEvent("settings", "1-0-1", {
    event: isAllowed
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "setup",
  });
};
