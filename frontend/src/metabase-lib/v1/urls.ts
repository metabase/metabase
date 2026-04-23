import * as Urls from "metabase/utils/urls";
import * as Lib from "metabase-lib";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { remapParameterValuesToTemplateTags } from "metabase-lib/v1/parameters/utils/template-tags";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";

import type Question from "./Question";
import { isTransientCardId } from "./Question";
import type NativeQuery from "./queries/NativeQuery";

type UrlBuilderOpts = {
  originalQuestion?: Question;
  query?: Record<string, any>;
  creationType?: string;
};

export function getQuestionUrl(
  question: Question,
  { originalQuestion, query, creationType }: UrlBuilderOpts = {},
) {
  question = question.omitTransientCardIds();

  if (
    // the question is unsaved
    !question.isSaved() ||
    // the question is transient (so not saved)
    isTransientCardId(question.id()) ||
    // the question is a new question based on the original question
    (originalQuestion && question.isDirtyComparedTo(originalQuestion))
  ) {
    return Urls.question(null, {
      hash: question.serializeForUrl({
        includeDisplayIsLocked: true,
        creationType,
      }),
      query,
    });
  } else {
    return Urls.question(question.card(), { query });
  }
}

export function getQuestionUrlWithParameters(
  question: Question,
  originalQuestion: Question,
  parameters: ParameterWithTarget[],
  parameterValues: Record<
    ParameterId,
    ParameterValueOrArray | undefined | null
  >,
  { objectId }: { objectId?: string | number } = {},
): string {
  if (parameters.length === 0 && objectId == null) {
    return getQuestionUrl(question);
  }

  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());

  if (isNative) {
    const query = question.legacyNativeQuery() as NativeQuery;
    return getQuestionUrl(question, {
      query: remapParameterValuesToTemplateTags(
        query.templateTags(),
        parameters,
        parameterValues,
      ),
    });
  }

  let questionWithParameters = question.setParameters(parameters);

  if (isEditable) {
    // treat the dataset/model question like it is already composed so that we can apply
    // dataset/model-specific metadata to the underlying dimension options
    const needsComposing = question.type() !== "question";
    questionWithParameters = needsComposing
      ? question.composeQuestionAdhoc().setParameters(parameters)
      : questionWithParameters;
    questionWithParameters = questionWithParameters
      .setParameterValues(parameterValues)
      ._convertParametersToMbql({ isComposed: needsComposing });

    return getQuestionUrl(questionWithParameters, {
      originalQuestion,
      query: objectId === undefined ? {} : { objectId },
    });
  }

  const query = getParameterValuesBySlug(parameters, parameterValues);
  return getQuestionUrl(questionWithParameters.markDirty(), { query });
}
