export type SetupVersion = "1.3.0";

export type StepSeenEvent = {
  event: "step_seen";
  version: SetupVersion;
  step:
    | "welcome"
    | "language"
    | "user_info"
    | "db_connection"
    | "usage_question"
    | "license_token"
    | "db_scheduling"
    | "data_usage"
    | "completed";
  step_number: number;
};

export type UsageReasonSelectedEvent = {
  event: "usage_reason_selected";
  version: SetupVersion;
  usage_reason: "self-service-analytics" | "embedding" | "both" | "not-sure";
};

export type LicenseTokenStepSubmittedEvent = {
  event: "license_token_step_submitted";
  version: SetupVersion;
  valid_token_present: boolean;
};

export type DatabaseSelectedEvent = {
  event: "database_selected";
  version: SetupVersion;
  database: string;
};

export type AddDataLaterClickedEvent = {
  event: "add_data_later_clicked";
  version: SetupVersion;
  source: "pre_selection" | "post_selection";
};

export type SetupEvent =
  | StepSeenEvent
  | UsageReasonSelectedEvent
  | LicenseTokenStepSubmittedEvent
  | DatabaseSelectedEvent
  | AddDataLaterClickedEvent;
