import type {
  Card,
  StructuredDatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/api";

export function isQuestionUsingModel(
  card: Card,
  modelId: number,
  modelTableId: string,
) {
  if (card.archived) {
    return false;
  }

  const datasetQuery = card.dataset_query;

  if (datasetQuery.type === "query") {
    const { query } = datasetQuery as StructuredDatasetQuery;
    const isStartedFromModel = query["source-table"] === modelTableId;
    if (isStartedFromModel) {
      return true;
    }
    const joins = (query as any).joins;
    return joins?.some?.((join: any) => join["source-table"] === modelTableId);
  }

  if (datasetQuery.type === "native") {
    const { native } = datasetQuery as NativeDatasetQuery;
    const trimmedQuery = native.query.replaceAll(" ", "");
    return trimmedQuery.includes(`{{#${modelId}`);
  }

  return false;
}
