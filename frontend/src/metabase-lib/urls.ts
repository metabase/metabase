import * as Urls from "metabase/lib/urls";
import { utf8_to_b64url } from "metabase/lib/encoding";
import type { ParameterId, ParameterValue } from "metabase-types/api";
import { isTransientId } from "metabase-lib/queries/utils/card";
import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";
import { remapParameterValuesToTemplateTags } from "metabase-lib/parameters/utils/template-tags";
import type { ParameterWithTarget } from "metabase-lib/parameters/types";
import type Question from "./Question";
import type NativeQuery from "./queries/NativeQuery";

type UrlBuilderOpts = {
  originalQuestion?: Question;
  query?: Record<string, any>;
  includeDisplayIsLocked?: boolean;
  creationType?: string;
  clean?: boolean;
};

export function getUrl(
  question: Question,
  {
    originalQuestion,
    clean = true,
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
        clean,
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
  { objectId, clean }: { objectId?: string | number; clean?: boolean } = {},
): string {
  const includeDisplayIsLocked = true;

  if (question.isStructured()) {
    let questionWithParameters = question.setParameters(parameters);

    if (question.isQueryEditable()) {
      questionWithParameters = questionWithParameters
        .setParameterValues(parameterValues)
        ._convertParametersToMbql();

      return getUrl(questionWithParameters, {
        clean,
        originalQuestion: question,
        includeDisplayIsLocked,
        query: objectId === undefined ? {} : { objectId },
      });
    }

    const query = getParameterValuesBySlug(parameters, parameterValues);
    return getUrl(questionWithParameters.markDirty(), {
      clean,
      query,
      includeDisplayIsLocked,
    });
  }

  const query = question.legacyQuery() as NativeQuery;
  return getUrl(question, {
    clean,
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
  const tableId = question.tableId();
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
