import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import {
  getAdHocQuestionDescription,
  shouldRenderAdhocDescription,
} from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const getQuestionTitle = (
  question: Question | undefined,
  tc?: ContentTranslationFunction,
): string | null => {
  if (!question) {
    return null;
  }

  const isSaved = question.isSaved();
  const displayName = question.displayName();

  if (isSaved && displayName) {
    return tc ? tc(displayName) : displayName;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const adhocDescription = getAdHocQuestionDescription({
    question,
    translateDisplayName: tc
      ? (name: string) =>
          PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(name, tc)
      : undefined,
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
