import { serializeCardForUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isParameterValuesMap } from "metabase-types/guards/parameter-values";

export function getSummaryQuestion(question: Question): Question {
  const query = question.query();
  const summary = question.withoutNameAndId();
  return Lib.stageIndexes(query).some(
    (stage) => Lib.aggregations(query, stage).length > 0,
  )
    ? summary
    : summary.setQuery(Lib.aggregateByCount(query, -1)).setDefaultDisplay();
}

export function getSummaryUrl(question: Question, returnTo: string): string {
  const hash = serializeCardForUrl(question.cardWithNormalizedQuery(), {
    parameterValues: question._parameterValues,
    includeDisplayIsLocked: true,
  });
  return `/explore?${new URLSearchParams({ mode: "question", returnTo })}#${hash}`;
}

export function restoreSummaryParameters(question: Question): Question {
  const card = question.card();
  return "parameterValues" in card && isParameterValuesMap(card.parameterValues)
    ? question.setParameterValues(card.parameterValues)
    : question;
}
