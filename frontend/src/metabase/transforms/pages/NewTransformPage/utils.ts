import { STARTER_PYTHON_BODY } from "metabase/transforms/constants";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  PythonTransformSourceDraft,
  QueryTransformSource,
  SuggestedTransform,
} from "metabase-types/api";

import type { NewTransformValues } from "./CreateTransformModal/form";

export function getInitialQuerySource(): QueryTransformSource {
  const question = Question.create({ DEPRECATED_RAW_MBQL_type: "query" });
  return {
    type: "query",
    query: question.datasetQuery(),
  };
}

export function getInitialNativeSource(): QueryTransformSource {
  const question = Question.create({ DEPRECATED_RAW_MBQL_type: "native" });
  return {
    type: "query",
    query: question.datasetQuery(),
  };
}

export function getInitialPythonSource(): PythonTransformSourceDraft {
  return {
    type: "python",
    "source-database": undefined,
    "source-tables": [],
    body: STARTER_PYTHON_BODY,
  };
}

export function getInitialCardSource(card: Card): QueryTransformSource {
  return { type: "query", query: card.dataset_query };
}

export function getDefaultValues(
  name: string,
  suggestedTransform?: SuggestedTransform,
): Partial<NewTransformValues> {
  if (suggestedTransform == null) {
    return { name };
  }

  return {
    name,
    targetName: suggestedTransform.target.name,
    targetSchema: suggestedTransform.target.schema,
  };
}
