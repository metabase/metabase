import { serializeCardForUrl } from "metabase/common/utils/card";
import type Question from "metabase-lib/v1/Question";

import { getQuestionReturnUrl } from "./question-handoff";

export function serializeExplorerDataset(question: Question): string {
  return serializeCardForUrl(question.cardWithNormalizedQuery(), {
    parameterValues: question._parameterValues,
    includeDisplayIsLocked: true,
  });
}

export function getDatasetExplorerUrl(
  question: Question,
  returnTo: string,
): string {
  const dataset = serializeExplorerDataset(
    question.withoutNameAndId().setDisplay("table"),
  );
  return `/explore?${new URLSearchParams({ dataset, returnTo })}`;
}

export function withExplorerContext(url: string, search: string): string {
  const params = new URLSearchParams(search);
  const context = new URLSearchParams();
  const dataset = params.get("dataset");
  const returnTo = getQuestionReturnUrl(search);
  if (dataset) {
    context.set("dataset", dataset);
  }
  if (returnTo) {
    context.set("returnTo", returnTo);
  }
  const hashIndex = url.indexOf("#");
  const path = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : url.slice(hashIndex);
  return `${path}${context.size ? `?${context}` : ""}${hash}`;
}
