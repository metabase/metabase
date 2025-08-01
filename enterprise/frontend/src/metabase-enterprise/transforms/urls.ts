import type {
  CardId,
  DatabaseId,
  DatasetQuery,
  TableId,
  TransformId,
} from "metabase-types/api";

export const ROOT_URL = "/admin/transforms";

export function getOverviewUrl() {
  return ROOT_URL;
}

export function getnewTransformUrl() {
  return `${ROOT_URL}/new`;
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
