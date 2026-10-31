import type { ContentTranslationFunction } from "metabase/content-translation/types";
import {
  getAdHocQuestionDescription,
  shouldRenderAdhocDescription,
} from "metabase/query_builder";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const getQuestionTitle = (
  question: Question | undefined,
  tc?: ContentTranslationFunction,
): string | null => {
  if (!question) {
    return null;
  }

  const displayName = question.displayName();

  // Show the explicit name when present. This covers both saved questions
  // (which have an id) and pre-filtered questions opened via click behavior
  // (serialized with a name but no id).
  if (displayName) {
    return tc ? tc(displayName) : displayName;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const adhocDescription = getAdHocQuestionDescription({
    question,
  });

  if (
    !isNative &&
    shouldRenderAdhocDescription({ question }) &&
    adhocDescription
  ) {
    return adhocDescription;
  }

  return null;
};
