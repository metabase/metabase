import type {
  TransformId,
  TransformRunStatus,
  TransformTagId,
} from "metabase-types/api";

export type RunListParams = {
  page?: number;
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
};
