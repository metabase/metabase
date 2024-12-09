type SetupEventSchema = {
  event: string;
  version: string;
  step?: string | null;
  step_number?: number | null;
  usage_reason?: string | null;
  database?: string | null;
  valid_token_present?: boolean | null;
  source?: string | null;
};

type ValidateEvent<
  T extends SetupEventSchema &
    Record<Exclude<keyof T, keyof SetupEventSchema>, never>,
> = T;

type SetupVersion = "1.3.0";

export type StepSeenEvent = ValidateEvent<{
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
}>;

export type UsageReasonSelectedEvent = ValidateEvent<{
  event: "usage_reason_selected";
  version: SetupVersion;
  usage_reason: "self-service-analytics" | "embedding" | "both" | "not-sure";
}>;

export type LicenseTokenStepSubmittedEvent = ValidateEvent<{
  event: "license_token_step_submitted";
  version: SetupVersion;
  valid_token_present: boolean;
}>;

export type DatabaseSelectedEvent = ValidateEvent<{
  event: "database_selected";
  version: SetupVersion;
  database: string;
}>;

export type AddDataLaterClickedEvent = ValidateEvent<{
  event: "add_data_later_clicked";
  version: SetupVersion;
  source: "pre_selection" | "post_selection";
}>;

export type SetupEvent =
  | StepSeenEvent
  | UsageReasonSelectedEvent
  | LicenseTokenStepSubmittedEvent
  | DatabaseSelectedEvent
  | AddDataLaterClickedEvent;
