import type {
  CardId,
  CollectionId,
  DatabaseId,
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
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

export const DATA_STUDIO_TABLE_METADATA_TABS = ["field", "segments"] as const;
export type DataStudioTableMetadataTab =
  (typeof DATA_STUDIO_TABLE_METADATA_TABS)[number];

export function isDataStudioTableMetadataTab(
  tab: unknown,
): tab is DataStudioTableMetadataTab {
  return DATA_STUDIO_TABLE_METADATA_TABS.includes(
    tab as DataStudioTableMetadataTab,
  );
}

type DataStudioDataParams = {
  databaseId?: DatabaseId;
  schemaName?: SchemaName | null;
  tableId?: TableId;
  tab?: DataStudioTableMetadataTab;
  fieldId?: FieldId;
};

export function dataStudio() {
  return ROOT_URL;
}

export function dataStudioData({
  databaseId,
  schemaName,
  tableId,
  tab,
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

        if (tab != null) {
          parts.push(tab);

          if (fieldId != null && tab === "field") {
            parts.push(String(fieldId));
          }
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

export function dataStudioTableSegments(tableId: TableId) {
  return `${dataStudioTable(tableId)}/segments`;
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
  return `${dataStudioModeling()}/segments/${segmentId}`;
}

export function newDataStudioSegment(tableId: TableId) {
  return `${dataStudioModeling()}/segments/new?tableId=${tableId}`;
}

export function dataStudioSegmentDependencies(segmentId: SegmentId) {
  return `${dataStudioSegment(segmentId)}/dependencies`;
}

export function dataStudioTasks() {
  return `${ROOT_URL}/tasks`;
}

export type DependencyListParams = {
  query?: string;
  page?: number;
  groupTypes?: DependencyGroupType[];
  sortColumn?: DependencySortColumn;
  sortDirection?: DependencySortDirection;
};

function dataStudioDependencies(
  baseUrl: string,
  { query, page, groupTypes, sortColumn, sortDirection }: DependencyListParams,
) {
  const searchParams = new URLSearchParams();

  if (query != null) {
    searchParams.set("query", query);
  }
  if (page != null) {
    searchParams.set("page", page.toString());
  }
  if (groupTypes != null) {
    groupTypes.forEach((groupType) =>
      searchParams.append("groupTypes", groupType),
    );
  }
  if (sortColumn != null) {
    searchParams.set("sortColumn", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sortDirection", sortDirection);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export function dataStudioUnreferencedItems(params: DependencyListParams = {}) {
  return dataStudioDependencies(`${dataStudioTasks()}/unreferenced`, params);
}
