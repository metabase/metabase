import { trackSchemaEvent, trackStructEvent } from "metabase/lib/analytics";

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

export const trackWelcomeStepCompleted = () => {
  trackStructEvent("Setup", "Welcome");
};

export const trackUserStepCompleted = () => {
  trackStructEvent("Setup", "User Details Step");
};

export const trackDatabaseStepCompleted = (engine?: string) => {
  trackStructEvent("Setup", "Database Step", engine);
};

export const trackPreferencesStepCompleted = (isTrackingAllowed: boolean) => {
  trackStructEvent("Setup", "Preferences Step", isTrackingAllowed);
};

export const trackSetupCompleted = () => {
  trackStructEvent("Setup", "Complete");
};

export const trackPasswordValidationError = () => {
  trackStructEvent("Setup", "Error", "password validation");
};

export const trackDatabaseValidationError = (engine: string) => {
  trackStructEvent("Setup", "Error", "database validation: " + engine);
};
