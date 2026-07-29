import type { TransformId, TransformRunForJobRun } from "metabase-types/api";

export type TransformRunByTransformId = Map<TransformId, TransformRunForJobRun>;
