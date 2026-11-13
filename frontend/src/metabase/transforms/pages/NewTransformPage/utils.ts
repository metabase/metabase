import {
  NATIVE_QUERY_TEMPLATE,
  STRUCTURED_QUERY_TEMPLATE,
} from "metabase-lib/v1/queries/templates";
import type {
  Card,
  PythonTransformSourceDraft,
  QueryTransformSource,
} from "metabase-types/api";

export function getInitialQuerySource(): QueryTransformSource {
  return {
    type: "query",
    query: STRUCTURED_QUERY_TEMPLATE,
  };
}

export function getInitialNativeSource(): QueryTransformSource {
  return {
    type: "query",
    query: NATIVE_QUERY_TEMPLATE,
  };
}

export function getInitialPythonSource(): PythonTransformSourceDraft {
  return {
    type: "python",
    "source-database": undefined,
    "source-tables": [],
    body: `# Write your Python transformation script here
import common
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
