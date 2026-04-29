import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import {
  describeQueryStage,
  getInfoStageIndex,
} from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";

/**
 * Renders a minimal question title without temporal bucket suffixes.
 * e.g. "Sum of Total by Created At" instead of "Sum of Total by Created At: Month".
 *
 * Mirrors the stage-selection logic from AdHocQuestionDescription: uses stage -2
 * when the last stage is an empty filter stage (common in drill-through queries),
 * otherwise stage -1. Falls back to Lib.suggestedName for raw/unnamed queries.
 *
 * Returns null when no meaningful title can be derived.
 */
export function McpQuestionTitle() {
  const { question } = useSdkQuestionContext();

  const title = useMemo(() => {
    if (!question) {
      return null;
    }

    const query = question.query();
    const stageIndex = getInfoStageIndex(query);

    return (
      describeQueryStage(query, stageIndex, { stripTemporalBucket: true }) ??
      Lib.suggestedName(query)
    );
  }, [question]);

  if (!title) {
    return null;
  }

  return (
    <Text fw={700} fz="h3" truncate>
      {title}
    </Text>
  );
}
