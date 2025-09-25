import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DatasetQuery,
  PythonTransformSource,
  QueryTransformSource,
} from "metabase-types/api";

export type InitialPythonTransformSource = Omit<
  PythonTransformSource,
  "source-database"
> & {
  "source-database": PythonTransformSource["source-database"] | undefined;
};

export type InitialTransformSource =
  | QueryTransformSource
  | InitialPythonTransformSource;

export function getInitialTransformSource(
  card: Card | undefined,
  type: DatasetQuery["type"] | "python",
): InitialTransformSource {
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

export function getInitialPythonTransformSource(): InitialPythonTransformSource {
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
