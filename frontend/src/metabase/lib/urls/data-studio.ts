import type {
  CardId,
  CollectionId,
  DatabaseId,
  DependencySortColumn,
  DependencySortDirection,
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

export function dataStudioData() {
  return `${ROOT_URL}/data`;
}

export function dataStudioDataDatabase(databaseId: DatabaseId) {
  return `${dataStudioData()}/database/${databaseId}`;
}

export function dataStudioDataSchema(
  databaseId: DatabaseId,
  schema: SchemaName | null,
) {
  return `${dataStudioDataDatabase(databaseId)}/schema/${databaseId}:${encodeURIComponent(schema ?? "")}`;
}

export function dataStudioDataTable(
  databaseId: DatabaseId,
  schema: SchemaName | null,
  tableId: TableId,
) {
  return `${dataStudioDataSchema(databaseId, schema)}/table/${tableId}`;
}

export function dataStudioModeling() {
  return `${ROOT_URL}/modeling`;
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

export function dataStudioTasks() {
  return `${ROOT_URL}/tasks`;
}

export type DependencyListParams = {
  page?: number;
  sortColumn?: DependencySortColumn;
  sortDirection?: DependencySortDirection;
};

function dataStudioDependencies(
  baseUrl: string,
  { page, sortColumn, sortDirection }: DependencyListParams,
) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", page.toString());
  }
  if (sortColumn != null) {
    searchParams.set("sort-column", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sort-direction", sortDirection);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export function dataStudioUnreferencedItems(params: DependencyListParams) {
  return dataStudioDependencies(`${dataStudioTasks()}/unreferenced`, params);
}
