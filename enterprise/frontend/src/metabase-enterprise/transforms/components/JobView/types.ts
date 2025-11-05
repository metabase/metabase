import type {
  ScheduleDisplayType,
  TransformJobId,
  TransformRun,
  TransformTagId,
} from "metabase-types/api";

export type TransformJobInfo = {
  id?: TransformJobId;
  name: string;
  description: string | null;
  schedule: string;
  ui_display_type: ScheduleDisplayType;
  tag_ids?: TransformTagId[];
  last_run?: TransformRun | null;
};
