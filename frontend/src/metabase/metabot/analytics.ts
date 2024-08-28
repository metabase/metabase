import { trackSchemaEvent } from "metabase/lib/analytics";
import type { MetabotFeedbackType } from "metabase-types/api";
import type { MetabotEntityType } from "metabase-types/store";

export type MetabotQueryRunResult = "success" | "failure" | "bad-sql";

const SCHEMA_NAME = "metabot";

export const trackMetabotQueryRun = (
  entity_type: MetabotEntityType | null,
  prompt_template_versions: string[] | null,
  _result: MetabotQueryRunResult,
  visualization_type: string | null,
  is_rerun: boolean,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "metabot_query_run",
    entity_type: entity_type ?? undefined,
    prompt_template_versions: prompt_template_versions ?? undefined,
    visualization_type: visualization_type ?? undefined,
    is_rerun,
  });
};

export const trackMetabotFeedbackReceived = (
  entity_type: MetabotEntityType | null,
  prompt_template_versions: string[] | null,
  feedback_type: MetabotFeedbackType | null,
) => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "metabot_feedback_received",
    entity_type: entity_type ?? undefined,
    prompt_template_versions: prompt_template_versions ?? undefined,
    feedback_type: feedback_type ?? undefined,
  });
};
