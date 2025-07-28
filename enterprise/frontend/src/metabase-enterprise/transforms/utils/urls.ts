import type {
  CardId,
  DatasetQuery,
  Table,
  TransformId,
} from "metabase-types/api";

const ROOT_URL = "/admin/datamodel/transforms";

export function newTransformUrl() {
  return "/admin/datamodel/transforms";
}

type NewTransformQueryUrlProps = {
  type?: DatasetQuery["type"];
  cardId?: CardId;
};

export function newTransformQueryUrl({
  type,
  cardId,
}: NewTransformQueryUrlProps) {
  const params = new URLSearchParams();
  if (type != null) {
    params.set("type", type);
  }
  if (cardId != null) {
    params.set("cardId", String(cardId));
  }
  return `${ROOT_URL}/new${params}`;
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
