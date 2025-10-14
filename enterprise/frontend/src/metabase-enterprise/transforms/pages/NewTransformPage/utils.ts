import Question from "metabase-lib/v1/Question";
import type { Card, LegacyDatasetQuery } from "metabase-types/api";

export function getInitialQueryTransformSource(
  card: Card | undefined,
  type: LegacyDatasetQuery["type"] | undefined,
) {
  const query =
    card != null
      ? card.dataset_query
      : Question.create({ DO_NOT_USE_type: type }).datasetQuery();

  return { type: "query" as const, query };
}

export function getInitialPythonTransformSource() {
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
