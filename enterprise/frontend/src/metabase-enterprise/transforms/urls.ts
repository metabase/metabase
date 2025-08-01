import type {
  CardId,
  DatasetQuery,
  Table,
  TransformId,
} from "metabase-types/api";

export const ROOT_URL = "/admin/transforms";

export function getOverviewPageUrl() {
  return ROOT_URL;
}

export function getEmptyStatePageUrl() {
  return `${ROOT_URL}/new`;
}

export function getNewTransformFromTypePageUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function getNewTransformFromCardPageUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}

export function getTransformUrl(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}`;
}

export function getTransformQueryUrl(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}/query`;
}

export function getTableMetadataUrl({ id, db_id, schema }: Table) {
  return `/admin/datamodel/database/${db_id}/schema/${db_id}:${encodeURIComponent(schema)}/table/${id}`;
}
