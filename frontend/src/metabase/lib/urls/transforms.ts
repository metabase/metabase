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
  transform_ids?: TransformId[];
  transform_tag_ids?: TransformTagId[];
  start_time?: string;
  end_time?: string;
  run_methods?: TransformRunMethod[];
};

export function transformRunList({
  page,
  transform_ids,
  statuses,
  transform_tag_ids,
  start_time,
  end_time,
  run_methods,
}: TransformRunListParams = {}) {
  const searchParams = new URLSearchParams();
  if (page != null) {
    searchParams.set("page", String(page));
  }
  transform_ids?.forEach((transformId) => {
    searchParams.append("transform_ids", String(transformId));
  });
  statuses?.forEach((status) => {
    searchParams.append("statuses", String(status));
  });
  transform_tag_ids?.forEach((tagId) => {
    searchParams.append("transform_tag_ids", String(tagId));
  });
  if (start_time != null) {
    searchParams.set("start_time", start_time);
  }
  if (end_time != null) {
    searchParams.set("end_time", end_time);
  }
  run_methods?.forEach((runMethod) => {
    searchParams.append("run_methods", runMethod);
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
