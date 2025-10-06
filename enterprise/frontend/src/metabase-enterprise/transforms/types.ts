import type {
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
  TransformTagId,
} from "metabase-types/api";

export type TransformListParams = {
  lastRunStartTime?: string;
  lastRunStatuses?: TransformRunStatus[];
  tagIds?: TransformTagId[];
};

export type JobListParams = {
  lastRunStartTime?: string;
  lastRunStatuses?: TransformRunStatus[];
  nextRunStartTime?: string;
  tagIds?: TransformTagId[];
};

export type RunListParams = {
  page?: number;
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};
