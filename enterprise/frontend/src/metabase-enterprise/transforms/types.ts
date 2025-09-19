import type {
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTagId,
} from "metabase-types/api";

export type RunListParams = {
  page?: number;
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};

export type JobListParams = {
  lastRunStartTime?: string;
  nextRunStartTime?: string;
  transformTagIds?: TransformTagId[];
};

export type PythonLibraryEditorPageParams = {
  path: string;
};
