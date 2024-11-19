type MetabotEventSchema = {
  event: string;
  entity_type?: string | null;
  feedback_type?: string | null;
  result_type?: string | null;
  prompt_template_versions?: string[] | null;
  visualization_type?: string | null;
  is_rerun?: boolean | null;
};

type ValidateEvent<
  T extends MetabotEventSchema &
    Record<Exclude<keyof T, keyof MetabotEventSchema>, never>,
> = T;

export type MetabotQueryRunEvent = ValidateEvent<{
  event: "metabot_query_run";
  entity_type: "database" | "model" | null;
  result_type: "success" | "failure" | "bad-sql";
  prompt_template_versions: string[] | null;
  visualization_type: string | null;
  is_rerun: boolean;
}>;

export type MetabotFeedbackReceivedEvent = ValidateEvent<{
  event: "metabot_feedback_received";
  entity_type: "database" | "model" | null;
  feedback_type:
    | "great"
    | "wrong_data"
    | "incorrect_result"
    | "invalid_sql"
    | null;
  prompt_template_versions: string[] | null;
}>;

export type MetabotEvent = MetabotQueryRunEvent | MetabotFeedbackReceivedEvent;
