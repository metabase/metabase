import type {
  CardId,
  DatabaseId,
  TableId,
  TransformId,
  TransformJobId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTagId,
} from "metabase-types/api";

const ROOT_URL = "/admin/transforms";

export type TransformListParams = {
  lastRunStartTime?: string;
  lastRunStatuses?: TransformRunStatus[];
  tagIds?: TransformTagId[];
};

export type TransformJobListParams = {
  lastRunStartTime?: string;
  lastRunStatuses?: TransformRunStatus[];
  nextRunStartTime?: string;
  tagIds?: TransformTagId[];
};

export type TransformRunListParams = {
  page?: number;
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};

export type TransformPythonLibraryParams = {
  path: string;
};

export function transformList({
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

export function newTransformFromType(type: "query" | "native" | "python") {
  return `${ROOT_URL}/new/${type}`;
}

export function newTransformFromCard(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}

export function transform(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}`;
}

export function transformQuery(transformId: TransformId) {
  return `${ROOT_URL}/${transformId}/query`;
}

export function transformJobList({
  lastRunStartTime,
  lastRunStatuses,
  nextRunStartTime,
  tagIds,
}: TransformJobListParams = {}) {
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
    return `${ROOT_URL}/jobs?${queryString}`;
  } else {
    return `${ROOT_URL}/jobs`;
  }
}

export function newTransformJob() {
  return `${ROOT_URL}/jobs/new`;
}

export function transformJob(id: TransformJobId) {
  return `${ROOT_URL}/jobs/${id}`;
}

export function transformRunList({
  page,
  transformIds,
  statuses,
  transformTagIds,
  startTime,
  endTime,
  runMethods,
}: TransformRunListParams = {}) {
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

export function transformPythonLibrary({ path }: TransformPythonLibraryParams) {
  return `/admin/transforms/library/${path}`;
}

export function queryBuilderTable(tableId: TableId, databaseId: DatabaseId) {
  return `/question#?db=${databaseId}&table=${tableId}`;
}
