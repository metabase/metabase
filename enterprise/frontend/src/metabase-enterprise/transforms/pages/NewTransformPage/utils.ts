import { match } from "ts-pattern";

import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DatasetQuery,
  PythonTransformSourceDraft,
  QueryTransformSource,
  SuggestedTransform,
} from "metabase-types/api";

export type InitialTransformSource =
  | QueryTransformSource
  | PythonTransformSourceDraft;

export function getInitialTransformSource(
  card: Card | undefined,
  type: DatasetQuery["type"] | "python",
  suggestedTransform: SuggestedTransform | undefined,
): InitialTransformSource {
  const canUseSuggestedTransform = match({
    type,
    suggestionSourceType: suggestedTransform?.source.type,
  })
    .with({ type: "native", suggestionSourceType: "query" }, () => true)
    .with({ type: "python", suggestionSourceType: "python" }, () => true)
    .otherwise(() => false);

  if (!card?.id && suggestedTransform && canUseSuggestedTransform) {
    return suggestedTransform.source;
  }

  if (type === "python") {
    return getInitialPythonTransformSource();
  }

  return getInitialQueryTransformSource(card, type);
}

export function getInitialQueryTransformSource(
  card: Card | undefined,
  type: DatasetQuery["type"] | undefined,
): QueryTransformSource {
  const query =
    card != null
      ? card.dataset_query
      : Question.create({ type }).datasetQuery();

  return { type: "query" as const, query };
}

export function getInitialPythonTransformSource(): PythonTransformSourceDraft {
  return {
    type: "python" as const,
    "source-database": undefined,
    "source-tables": {},
    body: `# Write your Python transformation script here
import pandas as pd

def transform():
    """
    Your transformation function.

    Select tables above to add them as function parameters.

    Returns:
        DataFrame to write to the destination table
    """
    # Your transformation logic here
    return pd.DataFrame([{"message": "Hello from Python transform!"}])`,
  };
}
