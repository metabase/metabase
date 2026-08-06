import type {
  CardId,
  CollectionId,
  DatabaseId,
  ErdParams,
  FieldId,
  MeasureId,
  NativeQuerySnippetId,
  SchemaName,
  SegmentId,
  TableId,
  WorktreeId,
} from "metabase-types/api";

const ROOT_URL = "/data-studio";

export type LibraryUrlParams = {
  worktreeId?: WorktreeId | null;
};

function libraryRootUrl(worktreeId?: WorktreeId | null) {
  return worktreeId != null
    ? `${ROOT_URL}/worktrees/${worktreeId}/library`
    : `${ROOT_URL}/library`;
}

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
    // Unjustified type cast. FIXME
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
  worktreeId,
}: { expandedIds?: CollectionId[] } & LibraryUrlParams = {}) {
  let query = "";
  if (expandedIds?.length) {
    const params = new URLSearchParams();
    expandedIds.forEach((id) => params.append("expandedId", String(id)));
    query = `?${params.toString()}`;
  }
  return `${libraryRootUrl(worktreeId)}${query}`;
}

export function dataStudioTable(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${libraryRootUrl(worktreeId)}/tables/${tableId}`;
}

export function dataStudioTableFields(
  tableId: TableId,
  fieldId?: FieldId,
  { worktreeId }: LibraryUrlParams = {},
) {
  const baseUrl = `${dataStudioTable(tableId, { worktreeId })}/fields`;
  return fieldId != null ? `${baseUrl}/${fieldId}` : baseUrl;
}

export function dataStudioTableDependencies(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTable(tableId, { worktreeId })}/dependencies`;
}

export function dataStudioTableSegments(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTable(tableId, { worktreeId })}/segments`;
}

export function dataStudioPublishedTableSegmentNew(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTableSegments(tableId, { worktreeId })}/new`;
}

export function dataStudioPublishedTableSegment(
  tableId: TableId,
  segmentId: SegmentId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTableSegments(tableId, { worktreeId })}/${segmentId}`;
}

export function dataStudioPublishedTableSegmentRevisions(
  tableId: TableId,
  segmentId: SegmentId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioPublishedTableSegment(tableId, segmentId, { worktreeId })}/revisions`;
}

export function dataStudioPublishedTableSegmentDependencies(
  tableId: TableId,
  segmentId: SegmentId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioPublishedTableSegment(tableId, segmentId, { worktreeId })}/dependencies`;
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

export function dataStudioTableMeasures(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTable(tableId, { worktreeId })}/measures`;
}

export function dataStudioPublishedTableMeasureNew(
  tableId: TableId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTableMeasures(tableId, { worktreeId })}/new`;
}

export function dataStudioPublishedTableMeasure(
  tableId: TableId,
  measureId: MeasureId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioTableMeasures(tableId, { worktreeId })}/${measureId}`;
}

export function dataStudioPublishedTableMeasureDependencies(
  tableId: TableId,
  measureId: MeasureId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioPublishedTableMeasure(tableId, measureId, { worktreeId })}/dependencies`;
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
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioPublishedTableMeasure(tableId, measureId, { worktreeId })}/revisions`;
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
} & LibraryUrlParams;

export function newDataStudioMetric({
  worktreeId,
  ...params
}: NewDataStudioMetricProps = {}) {
  return `${dataStudioLibrary({ worktreeId })}/metrics/new${getQueryString(params)}`;
}

export function dataStudioMetric(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioLibrary({ worktreeId })}/metrics/${cardId}`;
}

export function dataStudioMetricOverview(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioMetric(cardId, { worktreeId })}/overview`;
}

export function dataStudioMetricQuery(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioMetric(cardId, { worktreeId })}/query`;
}

export function dataStudioMetricDimensions(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioMetric(cardId, { worktreeId })}/dimensions`;
}

export function dataStudioMetricDependencies(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioMetric(cardId, { worktreeId })}/dependencies`;
}

export function dataStudioMetricHistory(
  cardId: CardId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioMetric(cardId, { worktreeId })}/history`;
}

type DataStudioSchemaViewerParams = {
  databaseId: DatabaseId;
  schema?: SchemaName;
  tableIds?: readonly TableId[];
};

export function getSchemaViewerParams({
  databaseId,
  schema,
  tableIds,
}: DataStudioSchemaViewerParams): ErdParams {
  const params: ErdParams = { "database-id": databaseId };
  if (schema != null) {
    params.schema = schema;
  }
  if (tableIds != null && tableIds.length > 0) {
    params["table-ids"] = [...tableIds];
  }
  return params;
}

export function dataStudioSchemaViewer(args?: DataStudioSchemaViewerParams) {
  const SCHEMA_VIEWER_BASE_URL = `${ROOT_URL}/schema-viewer`;
  if (!args) {
    return SCHEMA_VIEWER_BASE_URL;
  }

  const queryParams = getSchemaViewerParams(args);
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
  return `${SCHEMA_VIEWER_BASE_URL}?${params.toString()}`;
}

export function dataStudioGlossary() {
  return `${dataStudio()}/glossary`;
}

export function dataStudioGitSync() {
  return `${dataStudio()}/git-sync`;
}

export function dataStudioSnippet(
  snippetId: NativeQuerySnippetId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioLibrary({ worktreeId })}/snippets/${snippetId}`;
}

export function dataStudioSnippetDependencies(
  snippetId: NativeQuerySnippetId,
  { worktreeId }: LibraryUrlParams = {},
) {
  return `${dataStudioSnippet(snippetId, { worktreeId })}/dependencies`;
}

export function newDataStudioSnippet({ worktreeId }: LibraryUrlParams = {}) {
  return `${dataStudioLibrary({ worktreeId })}/snippets/new`;
}

export function dataStudioArchivedSnippets({
  worktreeId,
}: LibraryUrlParams = {}) {
  return `${dataStudioLibrary({ worktreeId })}/snippets/archived`;
}

export function dataStudioSettings() {
  return `${dataStudio()}/settings`;
}
