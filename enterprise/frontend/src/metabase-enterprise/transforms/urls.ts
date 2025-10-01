import type {
  CardId,
  DatabaseId,
  DatasetQuery,
  TableId,
  TransformId,
  TransformJobId,
} from "metabase-types/api";

import type {
  JobListParams,
  RunListParams,
  TransformListParams,
} from "./types";

export const ROOT_URL = "/bench/transforms";

export function getTransformListUrl({
  lastRunStartTime,
  lastRunStatuses,
  tagIds,
}: TransformListParams = {}) {
  const searchParams = new URLSearchParams();
  if (lastRunStartTime != null) {
    searchParams.set("lastRunStartTime", lastRunStartTime);
  }
  lastRunStatuses?.forEach((status) => {
    searchParams.append("lastRunStatuses", status);
  });
  tagIds?.forEach((tagId) => {
    searchParams.append("tagIds", String(tagId));
  });
  const queryString = searchParams.toString();
  if (queryString.length > 0) {
    return `${ROOT_URL}?${queryString}`;
  } else {
    return ROOT_URL;
  }
}

export function getNewTransformFromTypeUrl(
  type: DatasetQuery["type"] | "python",
) {
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

export function getJobListUrl({
  lastRunStartTime,
  lastRunStatuses,
  nextRunStartTime,
  tagIds,
}: JobListParams = {}) {
  const searchParams = new URLSearchParams();
  if (lastRunStartTime != null) {
    searchParams.set("lastRunStartTime", lastRunStartTime);
  }
  lastRunStatuses?.forEach((status) => {
    searchParams.append("lastRunStatuses", status);
  });
  if (nextRunStartTime != null) {
    searchParams.set("nextRunStartTime", nextRunStartTime);
  }
  tagIds?.forEach((tagId) => {
    searchParams.append("tagIds", String(tagId));
  });
  const queryString = searchParams.toString();
  if (queryString.length > 0) {
    return `/bench/jobs?${queryString}`;
  } else {
    return `/bench/jobs`;
  }
}

export function getNewJobUrl() {
  return `/bench/jobs/new`;
}

export function getJobUrl(id: TransformJobId) {
  return `/bench/jobs/${id}`;
}

export function getRunListUrl({
  page,
  transformIds,
  statuses,
  transformTagIds,
  startTime,
  endTime,
  runMethods,
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
  if (startTime != null) {
    searchParams.set("startTime", startTime);
  }
  if (endTime != null) {
    searchParams.set("endTime", endTime);
  }
  runMethods?.forEach((runMethod) => {
    searchParams.append("runMethods", runMethod);
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
