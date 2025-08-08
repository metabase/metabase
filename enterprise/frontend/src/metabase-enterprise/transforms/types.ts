import type { TransformExecutionStatus, TransformId } from "metabase-types/api";

export type RunListParams = {
  page?: number;
  transformIds?: TransformId[];
  statuses?: TransformExecutionStatus[];
};
