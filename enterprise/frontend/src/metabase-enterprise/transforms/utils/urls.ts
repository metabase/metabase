import type { Table, TransformId } from "metabase-types/api";

export function transformListUrl() {
  return "/admin/datamodel/transforms";
}

export function transformUrl(id: TransformId) {
  return `/admin/datamodel/transforms/${id}`;
}

export function newTransformUrl() {
  return "/admin/datamodel/transforms/new";
}

export function tableMetadataUrl({ id, db_id, schema }: Table) {
  return `/admin/datamodel/database/${db_id}/schema/${db_id}:${schema}/table/${id}`;
}
