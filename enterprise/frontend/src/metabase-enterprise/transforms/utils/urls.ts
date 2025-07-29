import type {
  CardId,
  DatasetQuery,
  Table,
  TransformId,
} from "metabase-types/api";

const ROOT_URL = "/admin/datamodel/transforms";

export function isTransformsRoute(path: string) {
  return path.startsWith(ROOT_URL);
}

export function getTransformRootUrl() {
  return ROOT_URL;
}

export function getTransformSettingsUrl() {
  return `${ROOT_URL}/settings`;
}

export function getNewTransformFromTypeUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function getNewTransformFromCardUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}

export function getTransformUrl(id: TransformId) {
  return `${ROOT_URL}/${id}`;
}

export function getTransformQueryUrl(id: TransformId) {
  return `${ROOT_URL}/${id}/query`;
}

export function getTableMetadataUrl({ id, db_id, schema }: Table) {
  return `/admin/datamodel/database/${db_id}/schema/${db_id}:${encodeURIComponent(schema)}/table/${id}`;
}
