import { utf8_to_b64url } from "metabase/lib/encoding";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { remapParameterValuesToTemplateTags } from "metabase-lib/v1/parameters/utils/template-tags";
import { isTransientId } from "metabase-lib/v1/queries/utils/card";
import type { ParameterId, ParameterValue } from "metabase-types/api";

import type Question from "./Question";
import type NativeQuery from "./queries/NativeQuery";

type UrlBuilderOpts = {
  originalQuestion?: Question;
  query?: Record<string, any>;
  includeDisplayIsLocked?: boolean;
  creationType?: string;
};

export function getUrl(
  question: Question,
  {
    originalQuestion,
    query,
    includeDisplayIsLocked,
    creationType,
  }: UrlBuilderOpts = {},
) {
  question = question.omitTransientCardIds();

  if (
    !question.id() ||
    (originalQuestion && question.isDirtyComparedTo(originalQuestion))
  ) {
    return Urls.question(null, {
      hash: question._serializeForUrl({
        includeDisplayIsLocked,
        creationType,
      }),
      query,
    });
  } else {
    return Urls.question(question.card(), { query });
  }
}

export function getUrlWithParameters(
  question: Question,
  parameters: ParameterWithTarget[],
  parameterValues: Record<ParameterId, ParameterValue>,
  { objectId }: { objectId?: string | number } = {},
): string {
  const includeDisplayIsLocked = true;
  if (parameters.length === 0 && objectId == null) {
    return getUrl(question, { includeDisplayIsLocked });
  }

  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  if (!isNative) {
    let questionWithParameters = question.setParameters(parameters);

    if (isEditable) {
      // treat the dataset/model question like it is already composed so that we can apply
      // dataset/model-specific metadata to the underlying dimension options
      questionWithParameters =
        question.type() !== "question"
          ? question.composeQuestionAdhoc().setParameters(parameters)
          : questionWithParameters;
      questionWithParameters = questionWithParameters
        .setParameterValues(parameterValues)
        ._convertParametersToMbql();

      return getUrl(questionWithParameters, {
        originalQuestion: question,
        includeDisplayIsLocked,
        query: objectId === undefined ? {} : { objectId },
      });
    }

    const query = getParameterValuesBySlug(parameters, parameterValues);
    return getUrl(questionWithParameters.markDirty(), {
      query,
      includeDisplayIsLocked,
    });
  }

  const query = question.legacyQuery() as NativeQuery;
  return getUrl(question, {
    query: remapParameterValuesToTemplateTags(
      query.templateTags(),
      parameters,
      parameterValues,
    ),
    includeDisplayIsLocked,
  });
}

export function getAutomaticDashboardUrl(
  question: Question,
  questionWithFilters: Question,
) {
  const questionId = question.id();
  const filterQuery = questionWithFilters.datasetQuery();
  const filter = filterQuery.type === "query" ? filterQuery.query.filter : null;
  const cellQuery = filter
    ? `/cell/${utf8_to_b64url(JSON.stringify(filter))}`
    : "";

  const query = question.datasetQuery();
  if (questionId != null && !isTransientId(questionId)) {
    return `auto/dashboard/question/${questionId}${cellQuery}`;
  } else {
    const adHocQuery = utf8_to_b64url(JSON.stringify(query));
    return `auto/dashboard/adhoc/${adHocQuery}${cellQuery}`;
  }
}

export function getComparisonDashboardUrl(
  question: Question,
  questionWithFilters: Question,
) {
  const questionId = question.id();
  const tableId = question.legacyQueryTableId();
  const filterQuery = questionWithFilters.datasetQuery();
  const filter = filterQuery.type === "query" ? filterQuery.query.filter : null;
  const cellQuery = filter
    ? `/cell/${utf8_to_b64url(JSON.stringify(filter))}`
    : "";

  const query = question.datasetQuery();
  if (questionId != null && !isTransientId(questionId)) {
    return `auto/dashboard/question/${questionId}${cellQuery}/compare/table/${tableId}`;
  } else {
    const adHocQuery = utf8_to_b64url(JSON.stringify(query));
    return `auto/dashboard/adhoc/${adHocQuery}${cellQuery}/compare/table/${tableId}`;
  }
}
