import type {
  CardId,
  DatabaseId,
  DatasetQuery,
  TableId,
  TransformId,
  TransformJobId,
} from "metabase-types/api";

import type { RunListParams } from "./types";

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

export function getNewJobUrl() {
  return `${ROOT_URL}/jobs/new`;
}

export function getJobUrl(id: TransformJobId) {
  return `${ROOT_URL}/jobs/${id}`;
}

export function getRunListUrl({
  page,
  transformIds,
  statuses,
  transformTagIds,
}: RunListParams = {}) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", String(page));
  }
  transformIds?.forEach((transformId) => {
    searchParams.append("transformIds", String(transformId));
  });
  statuses?.forEach((status) => {
    searchParams.append("statuses", String(status));
  });
  transformTagIds?.forEach((tagId) => {
    searchParams.append("transformTagIds", String(tagId));
  });

  const queryString = searchParams.toString();
  if (queryString.length > 0) {
    return `${ROOT_URL}/runs?${queryString}`;
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
