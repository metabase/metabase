import type {
  TransformExecutionStatus,
  TransformId,
  TransformTagId,
} from "metabase-types/api";

export type RunListParams = {
  page?: number;
  statuses?: TransformExecutionStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
};
