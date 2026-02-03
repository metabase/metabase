import type {
  CardId,
  CollectionId,
  DatabaseId,
  SortDirection,
  TableId,
  TransformId,
  TransformJobId,
  TransformRunMethod,
  TransformRunSortColumn,
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

export type TransformListParams = {
  collectionId?: CollectionId;
};

export function transformList({ collectionId }: TransformListParams = {}) {
  const searchParams = new URLSearchParams();
  if (collectionId != null) {
    searchParams.set("collectionId", String(collectionId));
  }

  const queryString = searchParams.toString();
  return queryString.length > 0
    ? `${TRANSFORMS_ROOT_URL}?${queryString}`
    : TRANSFORMS_ROOT_URL;
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
  sortColumn?: TransformRunSortColumn;
  sortDirection?: SortDirection;
};

export function transformRunList({
  page,
  transformIds,
  statuses,
  transformTagIds,
  startTime,
  endTime,
  runMethods,
  sortColumn,
  sortDirection,
}: TransformRunListParams = {}) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", String(page));
  }
  transformIds?.forEach((transformId) => {
    searchParams.append("transform-ids", String(transformId));
  });
  statuses?.forEach((status) => {
    searchParams.append("statuses", String(status));
  });
  transformTagIds?.forEach((tagId) => {
    searchParams.append("transform-tag-ids", String(tagId));
  });
  if (startTime != null) {
    searchParams.set("start-time", startTime);
  }
  if (endTime != null) {
    searchParams.set("end-time", endTime);
  }
  runMethods?.forEach((runMethod) => {
    searchParams.append("run-methods", runMethod);
  });
  if (sortColumn != null) {
    searchParams.set("sort-column", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sort-direction", sortDirection);
  }

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
