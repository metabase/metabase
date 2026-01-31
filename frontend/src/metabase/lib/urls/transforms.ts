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

const TRANSFORMS_ROOT_URL = `/data-studio/transforms`;
const JOBS_ROOT_URL = `${TRANSFORMS_ROOT_URL}/jobs`;
const RUNS_ROOT_URL = `${TRANSFORMS_ROOT_URL}/runs`;
const LIBRARY_ROOT_URL = `${TRANSFORMS_ROOT_URL}/library`;

export type TransformPythonLibraryParams = {
  path: string;
};

export function transformList() {
  return TRANSFORMS_ROOT_URL;
}

export function newQueryTransform() {
  return `${TRANSFORMS_ROOT_URL}/new/query`;
}

export function newNativeTransform() {
  return `${TRANSFORMS_ROOT_URL}/new/native`;
}

export function newPythonTransform() {
  return `${TRANSFORMS_ROOT_URL}/new/python`;
}

export function newTransformFromCard(cardId: CardId) {
  return `${TRANSFORMS_ROOT_URL}/new/card/${cardId}`;
}

export function transform(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}`;
}

export function transformEdit(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/edit`;
}

export function transformRun(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/run`;
}

export function transformSettings(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/settings`;
}

export function transformDependencies(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/dependencies`;
}

export function transformInspect(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/inspect`;
}

export function transformInspectV2(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/inspect-v2`;
}

export function transformInspectMock(transformId: TransformId) {
  return `${TRANSFORMS_ROOT_URL}/${transformId}/inspect-mock`;
}

export function transformJobList() {
  return JOBS_ROOT_URL;
}

export function newTransformJob() {
  return `${JOBS_ROOT_URL}/new`;
}

export function transformJob(id: TransformJobId) {
  return `${JOBS_ROOT_URL}/${id}`;
}

export type TransformRunListParams = {
  page?: number;
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};

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
    return `${RUNS_ROOT_URL}?${queryString}`;
  } else {
    return RUNS_ROOT_URL;
  }
}

export function transformPythonLibrary({ path }: TransformPythonLibraryParams) {
  return `${LIBRARY_ROOT_URL}/${path}`;
}

export function queryBuilderTable(tableId: TableId, databaseId: DatabaseId) {
  return `/question#?db=${databaseId}&table=${tableId}`;
}
