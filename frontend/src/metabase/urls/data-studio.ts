import type {
  CardId,
  CollectionId,
  DatabaseId,
  FieldId,
  GetErdRequest,
  MeasureId,
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

export const DATA_STUDIO_TABLE_METADATA_TABS = [
  "details",
  "field",
  "segments",
  "measures",
] as const;
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

export function dataStudioLibrary({
  expandedIds,
}: { expandedIds?: CollectionId[] } = {}) {
  let query = "";
  if (expandedIds?.length) {
    const params = new URLSearchParams();
    expandedIds.forEach((id) => params.append("expandedId", String(id)));
    query = `?${params.toString()}`;
  }
  return `${ROOT_URL}/library${query}`;
}

export function dataStudioTable(tableId: TableId) {
  return `${dataStudioLibrary()}/tables/${tableId}`;
}

export function dataStudioTableFields(tableId: TableId, fieldId?: FieldId) {
  const baseUrl = `${dataStudioLibrary()}/tables/${tableId}/fields`;
  return fieldId != null ? `${baseUrl}/${fieldId}` : baseUrl;
}

export function dataStudioTableDependencies(tableId: TableId) {
  return `${dataStudioTable(tableId)}/dependencies`;
}

export function dataStudioTableSegments(tableId: TableId) {
  return `${dataStudioTable(tableId)}/segments`;
}

export function dataStudioPublishedTableSegmentNew(tableId: TableId) {
  return `${dataStudioTableSegments(tableId)}/new`;
}

export function dataStudioPublishedTableSegment(
  tableId: TableId,
  segmentId: SegmentId,
) {
  return `${dataStudioTableSegments(tableId)}/${segmentId}`;
}

export function dataStudioPublishedTableSegmentRevisions(
  tableId: TableId,
  segmentId: SegmentId,
) {
  return `${dataStudioPublishedTableSegment(tableId, segmentId)}/revisions`;
}

export function dataStudioPublishedTableSegmentDependencies(
  tableId: TableId,
  segmentId: SegmentId,
) {
  return `${dataStudioPublishedTableSegment(tableId, segmentId)}/dependencies`;
}

type DataModelSegmentParams = {
  databaseId: DatabaseId;
  schemaName: SchemaName;
  tableId: TableId;
  segmentId: SegmentId;
};

export function dataStudioDataModelSegment({
  databaseId,
  schemaName,
  tableId,
  segmentId,
}: DataModelSegmentParams) {
  return `${dataStudioData({ databaseId, schemaName, tableId, tab: "segments" })}/${segmentId}`;
}

export function dataStudioDataModelSegmentRevisions(
  params: DataModelSegmentParams,
) {
  return `${dataStudioDataModelSegment(params)}/revisions`;
}

export function dataStudioDataModelSegmentDependencies(
  params: DataModelSegmentParams,
) {
  return `${dataStudioDataModelSegment(params)}/dependencies`;
}

export function newDataStudioDataModelSegment({
  databaseId,
  schemaName,
  tableId,
}: Omit<DataModelSegmentParams, "segmentId">) {
  return `${dataStudioData({ databaseId, schemaName, tableId, tab: "segments" })}/new`;
}

export function dataStudioTableMeasures(tableId: TableId) {
  return `${dataStudioTable(tableId)}/measures`;
}

export function dataStudioPublishedTableMeasureNew(tableId: TableId) {
  return `${dataStudioTableMeasures(tableId)}/new`;
}

export function dataStudioPublishedTableMeasure(
  tableId: TableId,
  measureId: MeasureId,
) {
  return `${dataStudioTableMeasures(tableId)}/${measureId}`;
}

export function dataStudioPublishedTableMeasureDependencies(
  tableId: TableId,
  measureId: MeasureId,
) {
  return `${dataStudioPublishedTableMeasure(tableId, measureId)}/dependencies`;
}

type DataModelMeasureParams = {
  databaseId: DatabaseId;
  schemaName: SchemaName;
  tableId: TableId;
  measureId: MeasureId;
};

export function dataStudioDataModelMeasure({
  databaseId,
  schemaName,
  tableId,
  measureId,
}: DataModelMeasureParams) {
  return `${dataStudioData({ databaseId, schemaName, tableId, tab: "measures" })}/${measureId}`;
}

export function dataStudioDataModelMeasureDependencies(
  params: DataModelMeasureParams,
) {
  return `${dataStudioDataModelMeasure(params)}/dependencies`;
}

export function dataStudioDataModelMeasureRevisions(
  params: DataModelMeasureParams,
) {
  return `${dataStudioDataModelMeasure(params)}/revisions`;
}

export function dataStudioPublishedTableMeasureRevisions(
  tableId: TableId,
  measureId: MeasureId,
) {
  return `${dataStudioPublishedTableMeasure(tableId, measureId)}/revisions`;
}

export function newDataStudioDataModelMeasure({
  databaseId,
  schemaName,
  tableId,
}: Omit<DataModelMeasureParams, "measureId">) {
  return `${dataStudioData({ databaseId, schemaName, tableId, tab: "measures" })}/new`;
}

export type NewDataStudioMetricProps = {
  collectionId?: CollectionId;
};

export function newDataStudioMetric(params: NewDataStudioMetricProps = {}) {
  return `${dataStudioLibrary()}/metrics/new${getQueryString(params)}`;
}

export function dataStudioMetric(cardId: CardId) {
  return `${dataStudioLibrary()}/metrics/${cardId}`;
}

export function dataStudioMetricOverview(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/overview`;
}

export function dataStudioMetricQuery(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/query`;
}

export function dataStudioMetricDependencies(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/dependencies`;
}

export function dataStudioMetricCaching(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/caching`;
}

export function dataStudioMetricHistory(cardId: CardId) {
  return `${dataStudioMetric(cardId)}/history`;
}

export function dataStudioErdBase() {
  return `${ROOT_URL}/schema-viewer`;
}

type DataStudioErdParams = {
  databaseId: DatabaseId;
  schema?: SchemaName;
  tableIds?: readonly TableId[];
};

/**
 * Build the request body for `useGetErdQuery`.
 *
 * Backend semantics:
 *  - With a schema, the backend returns all tables in that schema; we only
 *    append `table-ids` for external tables the user has explicitly expanded
 *    into.
 *  - With no schema but explicit table-ids, those are the focal set.
 *  - At least one of `schema` or `table-ids` must be provided.
 */
export function getErdQueryParams({
  databaseId,
  schema,
  tableIds,
}: DataStudioErdParams): GetErdRequest {
  const params: GetErdRequest = { "database-id": databaseId };
  if (schema != null) {
    params.schema = schema;
  }
  if (tableIds != null && tableIds.length > 0) {
    params["table-ids"] = [...tableIds];
  }
  return params;
}

export function dataStudioErd(args: DataStudioErdParams) {
  const queryParams = getErdQueryParams(args);
  const params = new URLSearchParams();
  params.set("database-id", String(queryParams["database-id"]));
  if (queryParams.schema != null) {
    params.set("schema", queryParams.schema);
  }
  if (queryParams["table-ids"] != null) {
    for (const id of queryParams["table-ids"]) {
      params.append("table-ids", String(id));
    }
  }
  return `${dataStudioErdBase()}?${params.toString()}`;
}

export function dataStudioGlossary() {
  return `${dataStudio()}/glossary`;
}

export function dataStudioGitSync() {
  return `${dataStudio()}/git-sync`;
}

export function dataStudioSnippet(snippetId: NativeQuerySnippetId) {
  return `${dataStudioLibrary()}/snippets/${snippetId}`;
}

export function dataStudioSnippetDependencies(snippetId: NativeQuerySnippetId) {
  return `${dataStudioSnippet(snippetId)}/dependencies`;
}

export function newDataStudioSnippet() {
  return `${dataStudioLibrary()}/snippets/new`;
}

export function dataStudioArchivedSnippets() {
  return `${dataStudioLibrary()}/snippets/archived`;
}

export function dataStudioSegment(segmentId: SegmentId) {
  return `${dataStudioLibrary()}/segments/${segmentId}`;
}
