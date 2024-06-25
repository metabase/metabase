import { trackSchemaEvent } from "metabase/lib/analytics";
import type { MetabotFeedbackType } from "metabase-types/api";
import type { MetabotEntityType } from "metabase-types/store";

export type MetabotQueryRunResult = "success" | "failure" | "bad-sql";

const SCHEMA_NAME = "metabot";
const TEMPLATE_VERSION = "1-0-1";

export const trackMetabotQueryRun = (
  entity_type: MetabotEntityType | null,
  prompt_template_versions: string[] | null,
  result: MetabotQueryRunResult,
  visualization_type: string | null,
  is_rerun: boolean,
) => {
  trackSchemaEvent(SCHEMA_NAME, TEMPLATE_VERSION, {
    event: "metabot_query_run",
    entity_type,
    prompt_template_versions,
    result,
    visualization_type,
    is_rerun,
  });
};

export const trackMetabotFeedbackReceived = (
  entity_type: MetabotEntityType | null,
  prompt_template_versions: string[] | null,
  feedback_type: MetabotFeedbackType | null,
) => {
  trackSchemaEvent(SCHEMA_NAME, TEMPLATE_VERSION, {
    event: "metabot_feedback_received",
    entity_type,
    prompt_template_versions,
    feedback_type,
  });
};
