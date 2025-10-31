import Question from "metabase-lib/v1/Question";
import type {
  Card,
  PythonTransformSourceDraft,
  QueryTransformSource,
} from "metabase-types/api";

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

export function getInitialCardSource(card: Card): QueryTransformSource {
  return { type: "query", query: card.dataset_query };
}
