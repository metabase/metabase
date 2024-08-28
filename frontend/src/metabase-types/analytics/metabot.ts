export type MetabotQueryRunEvent = {
  event: "metabot_query_run";
  entity_type?: "database" | "model";
  result_type?: "success" | "failure" | "bad-sql";
  prompt_template_versions?: string[];
  visualization_type?: string;
  is_rerun: boolean;
};

export type MetabotFeedbackReceivedEvent = {
  event: "metabot_feedback_received";
  entity_type?: "database" | "model";
  feedback_type?: "great" | "wrong_data" | "incorrect_result" | "invalid_sql";
  prompt_template_versions?: string[];
};

export type MetabotEvent = MetabotQueryRunEvent | MetabotFeedbackReceivedEvent;
