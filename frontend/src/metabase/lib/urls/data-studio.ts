import type {
  CardId,
  CollectionId,
  DatabaseId,
  FieldId,
  NativeQuerySnippetId,
  SchemaName,
  SegmentId,
  TableId,
} from "metabase-types/api";

const ROOT_URL = "/data-studio";

type OptionalParams = {
  collectionId?: CollectionId;
};

function getQueryString({ collectionId }: OptionalParams) {
  const searchParams = new URLSearchParams();
  if (collectionId != null) {
    searchParams.set("collectionId", String(collectionId));
  }
  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function dataStudio() {
  return ROOT_URL;
}

type DataStudioDataParams = {
  databaseId?: DatabaseId;
  schemaName?: SchemaName | null;
  tableId?: TableId;
  fieldId?: FieldId;
};

export function dataStudioData({
  databaseId,
  schemaName,
  tableId,
  fieldId,
}: DataStudioDataParams = {}) {
  const parts = [ROOT_URL, "data"];

  if (databaseId != null) {
    parts.push("database", String(databaseId));

    if (schemaName != null) {
      const schemaId = `${databaseId}:${encodeURIComponent(schemaName)}`;
      parts.push("schema", schemaId);

      if (tableId != null) {
        parts.push("table", String(tableId));

        if (fieldId != null) {
          parts.push("field", String(fieldId));
        }
      }
    }
  }

  return parts.join("/");
}

export function dataStudioModeling() {
  return `${ROOT_URL}/modeling`;
}

export function dataStudioTable(tableId: TableId) {
  return `${dataStudioModeling()}/tables/${tableId}`;
}

export function dataStudioTableFields(tableId: TableId, fieldId?: FieldId) {
  const baseUrl = `${dataStudioModeling()}/tables/${tableId}/fields`;
  return fieldId != null ? `${baseUrl}/${fieldId}` : baseUrl;
}

export function dataStudioTableDependencies(tableId: TableId) {
  return `${dataStudioTable(tableId)}/dependencies`;
}

export type NewDataStudioQueryModelParams = {
  collectionId?: CollectionId;
};

export function newDataStudioQueryModel(
  params: NewDataStudioQueryModelParams = {},
) {
  return `${dataStudioModeling()}/models/new/query${getQueryString(params)}`;
}

export type NewDataStudioNativeModelParams = {
  collectionId?: CollectionId;
};

export function newDataStudioNativeModel(
  params: NewDataStudioNativeModelParams = {},
) {
  return `${dataStudioModeling()}/models/new/native${getQueryString(params)}`;
}

export function dataStudioModel(cardId: CardId) {
  return `${dataStudioModeling()}/models/${cardId}`;
}

export function dataStudioModelQuery(cardId: CardId) {
  return `${dataStudioModel(cardId)}/query`;
}

export function dataStudioModelFields(cardId: CardId) {
  return `${dataStudioModel(cardId)}/fields`;
}

export function dataStudioModelDependencies(cardId: CardId) {
  return `${dataStudioModel(cardId)}/dependencies`;
}

export type NewDataStudioMetricProps = {
  collectionId?: CollectionId;
};

export function newDataStudioMetric(params: NewDataStudioMetricProps = {}) {
  return `${dataStudioModeling()}/metrics/new${getQueryString(params)}`;
}

export function dataStudioMetric(cardId: CardId) {
  return `${dataStudioModeling()}/metrics/${cardId}`;
}

export function dataStudioMetricQuery(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/query`;
}

export function dataStudioMetricDependencies(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/dependencies`;
}

export function dataStudioGlossary() {
  return `${dataStudioModeling()}/glossary`;
}

export function dataStudioCollection(collectionId: CollectionId) {
  return `${dataStudioModeling()}/collections/${collectionId}`;
}

export function dataStudioSnippet(snippetId: NativeQuerySnippetId) {
  return `${dataStudioModeling()}/snippets/${snippetId}`;
}

export function dataStudioSnippetDependencies(snippetId: NativeQuerySnippetId) {
  return `${dataStudioSnippet(snippetId)}/dependencies`;
}

export function newDataStudioSnippet() {
  return `${dataStudioModeling()}/snippets/new`;
}

export function dataStudioSegment(segmentId: SegmentId) {
  return `/admin/datamodel/segment/${segmentId}`;
}

export function dataStudioSegmentDependencies(segmentId: SegmentId) {
  return `${dataStudioSegment(segmentId)}/dependencies`;
}
