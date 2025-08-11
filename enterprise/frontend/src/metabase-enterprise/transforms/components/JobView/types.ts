import type {
  TransformExecution,
  TransformJobId,
  TransformTagId,
} from "metabase-types/api";

export type TransformJobInfo = {
  id?: TransformJobId;
  name: string;
  description: string | null;
  schedule: string;
  tag_ids?: TransformTagId[];
  last_execution?: TransformExecution | null;
};
