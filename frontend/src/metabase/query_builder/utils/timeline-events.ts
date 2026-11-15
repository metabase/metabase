import { canDisplayTimelineEvents } from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";

// A saved question chart that could have recorded a timeline selection but didn't predates recording
export const isLegacyTimelineEventsSource = (
  source: Question | null | undefined,
) =>
  Boolean(
    source?.isSaved() &&
    source.type() === "question" &&
    canDisplayTimelineEvents(source.display()),
  );
