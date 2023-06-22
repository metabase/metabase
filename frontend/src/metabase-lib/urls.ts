import * as Urls from "metabase/lib/urls";
import { utf8_to_b64url } from "metabase/lib/encoding";
import type {
  Filter as RawFilter,
  ParameterId,
  ParameterValue,
} from "metabase-types/api";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Filter from "metabase-lib/queries/structured/Filter";
import { isTransientId } from "metabase-lib/queries/utils/card";
import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";
import { remapParameterValuesToTemplateTags } from "metabase-lib/parameters/utils/template-tags";
import type { ParameterWithTarget } from "metabase-lib/parameters/types";
import type Question from "./Question";
import NativeQuery from "./queries/NativeQuery";

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

    if (question.query().isEditable()) {
      questionWithParameters = questionWithParameters
        .setParameterValues(parameterValues)
        ._convertParametersToMbql();

      return getUrl(questionWithParameters, {
        clean,
        originalQuestion: question,
        includeDisplayIsLocked,
        query: { objectId },
      });
    }

    const query = getParameterValuesBySlug(parameters, parameterValues);
    return getUrl(questionWithParameters.markDirty(), {
      clean,
      query,
      includeDisplayIsLocked,
    });
  }

  const query = question.query() as NativeQuery;
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
  filters: (RawFilter | Filter[])[],
) {
  let cellQuery = "";

  if (filters.length > 0) {
    const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
    cellQuery = `/cell/${utf8_to_b64url(JSON.stringify(mbqlFilter))}`;
  }

  const questionId = question.id();

  if (questionId != null && !isTransientId(questionId)) {
    return `/auto/dashboard/question/${questionId}${cellQuery}`;
  } else {
    const adHocQuery = utf8_to_b64url(
      JSON.stringify(question.card().dataset_query),
    );
    return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}`;
  }
}

export function getComparisonDashboardUrl(
  question: Question,
  filters: (RawFilter | Filter[])[],
) {
  let cellQuery = "";

  if (filters.length > 0) {
    const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
    cellQuery = `/cell/${utf8_to_b64url(JSON.stringify(mbqlFilter))}`;
  }

  const questionId = question.id();
  const query = question.query();

  if (query instanceof StructuredQuery) {
    const tableId = query.tableId();

    if (tableId) {
      if (questionId != null && !isTransientId(questionId)) {
        return `/auto/dashboard/question/${questionId}${cellQuery}/compare/table/${tableId}`;
      } else {
        const adHocQuery = utf8_to_b64url(
          JSON.stringify(question.card().dataset_query),
        );
        return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}/compare/table/${tableId}`;
      }
    }
  }
}
