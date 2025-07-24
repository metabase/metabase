import type { Table, TransformId } from "metabase-types/api";

export function transformListUrl() {
  return "/admin/datamodel/transforms";
}

export function newTransformUrl() {
  return `${transformListUrl()}/new`;
}

export function transformUrl(id: TransformId) {
  return `${transformListUrl()}/${id}`;
}

export function transformQueryUrl(id: TransformId) {
  return `${transformUrl(id)}/query`;
}

export function tableMetadataUrl({ id, db_id, schema }: Table) {
  return `/admin/datamodel/database/${db_id}/schema/${db_id}:${encodeURIComponent(schema)}/table/${id}`;
}
