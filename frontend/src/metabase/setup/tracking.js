import { trackSchemaEvent } from "metabase/lib/analytics";
import { STEPS } from "./constants";

export const trackStepSeen = stepNumber => {
  trackSchemaEvent("setup", "1-0-0", {
    event: "step_seen",
    version: "1.0.0",
    step: STEPS[stepNumber],
    step_number: stepNumber,
  });
};

export const trackDatabaseSelected = (stepNumber, database) => {
  trackSchemaEvent("setup", "1-0-0", {
    event: "database_selected",
    version: "1.0.0",
    step: STEPS[stepNumber],
    step_number: stepNumber,
    database,
  });
};

export const trackAddDataLaterClicked = (stepNumber, database) => {
  trackSchemaEvent("setup", "1-0-0", {
    event: "add_data_later_clicked",
    version: "1.0.0",
    step: STEPS[stepNumber],
    step_number: stepNumber,
    source: database ? "post_selection" : "pre_selection",
  });
};
