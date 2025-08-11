import type {
  TransformJobId,
  TransformRun,
  TransformTagId,
} from "metabase-types/api";

export type TransformJobInfo = {
  id?: TransformJobId;
  name: string;
  description: string | null;
  schedule: string;
  tag_ids?: TransformTagId[];
  last_run?: TransformRun | null;
};
