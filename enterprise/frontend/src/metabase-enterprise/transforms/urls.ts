import type {
  CardId,
  DatabaseId,
  DatasetQuery,
  TableId,
  TransformId,
  TransformJobId,
} from "metabase-types/api";

export const ROOT_URL = "/admin/transforms";

export function getTransformListUrl() {
  return ROOT_URL;
}

export function getNewTransformFromTypeUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function getNewTransformFromCardUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}

export function getTransformUrl(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}`;
}

export function getTransformQueryUrl(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}/query`;
}

export function getJobListUrl() {
  return `${ROOT_URL}/jobs`;
}

export function getJobUrl(id: TransformJobId) {
  return `${ROOT_URL}/jobs/${id}`;
}

type RunListParams = {
  page?: number;
};

export function getRunListUrl({ page }: RunListParams = {}) {
  const params = new URLSearchParams();
  if (page != null) {
    params.set("page", String(page));
  }

  if (params.size > 0) {
    return `${ROOT_URL}/runs?${params}`;
  } else {
    return `${ROOT_URL}/runs`;
  }
}

export function getBrowseDatabaseUrl(databaseId: DatabaseId) {
  return `/browse/databases/${databaseId}`;
}

export function getBrowseSchemaUrl(databaseId: DatabaseId, schema: string) {
  return `/browse/databases/${databaseId}/schema/${schema ?? ""}`;
}

export function getQueryBuilderUrl(tableId: TableId, databaseId: DatabaseId) {
  return `/question#?db=${databaseId}&table=${tableId}`;
}

export function getTableMetadataUrl(
  tableId: TableId,
  schema: string | null,
  databaseId: DatabaseId,
) {
  return `/admin/datamodel/database/${databaseId}/schema/${databaseId}:${encodeURIComponent(schema ?? "")}/table/${tableId}`;
}
