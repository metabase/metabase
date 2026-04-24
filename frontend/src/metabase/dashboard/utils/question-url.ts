import * as Urls from "metabase/utils/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";

// Builds a URL to a structured (MBQL) question with dashboard parameters applied.
// Callers must handle native queries themselves — their parameters map to template
// tags and produce a different URL shape.
export function getStructuredQuestionUrlWithParameters(
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
    return Urls.question(question);
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const questionWithParameters = question.setParameters(parameters);

  if (isEditable) {
    // treat the dataset/model question like it is already composed so that we can apply
    // dataset/model-specific metadata to the underlying dimension options
    const needsComposing = question.type() !== "question";
    const composed = needsComposing
      ? question.composeQuestionAdhoc().setParameters(parameters)
      : questionWithParameters;
    const withMbqlFilters = composed
      .setParameterValues(parameterValues)
      ._convertParametersToMbql({ isComposed: needsComposing });

    return Urls.question(withMbqlFilters, {
      originalQuestion,
      query: objectId === undefined ? {} : { objectId },
    });
  }

  const query = getParameterValuesBySlug(parameters, parameterValues);
  return Urls.question(questionWithParameters.markDirty(), { query });
}
