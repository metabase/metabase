import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import {
  describeQueryStage,
  getInfoStageIndex,
} from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/utils";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

/**
 * Renders a minimal question title without temporal bucket suffixes.
 * e.g. "Sum of Total by Created At" instead of "Sum of Total by Created At: Month".
 *
 * Mirrors the stage-selection logic from AdHocQuestionDescription: uses stage -2
 * when the last stage is an empty filter stage (common in drill-through queries),
 * otherwise stage -1.
 *
 * Returns null when no meaningful title can be derived.
 */
export function getMcpQuestionTitle(question: Question | undefined) {
  if (!question) {
    return null;
  }

  const query = question.query();
  const stageIndex = getInfoStageIndex(query);

  return (
    describeQueryStage(query, stageIndex, { stripTemporalBucket: true }) ??
    Lib.suggestedName(query)
  );
}

export function McpQuestionTitle() {
  const { question } = useSdkQuestionContext();

  const title = useMemo(() => {
    return getMcpQuestionTitle(question);
  }, [question]);

  if (!title) {
    return null;
  }

  return (
    <Text fw={700} fz="h3" px="md" py="sm" truncate>
      {title}
    </Text>
  );
}
