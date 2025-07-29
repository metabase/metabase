import type {
  CardId,
  DatasetQuery,
  Table,
  TransformId,
} from "metabase-types/api";

const ROOT_URL = "/admin/datamodel/transforms";

export function transformListUrl() {
  return ROOT_URL;
}

export function newTransformFromTypeUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function newTransformFromCardUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}

export function transformUrl(id: TransformId) {
  return `${ROOT_URL}/${id}`;
}

export function transformQueryUrl(id: TransformId) {
  return `${ROOT_URL}/${id}/query`;
}

export function tableMetadataUrl({ id, db_id, schema }: Table) {
  return `/admin/datamodel/database/${db_id}/schema/${db_id}:${encodeURIComponent(schema)}/table/${id}`;
}
