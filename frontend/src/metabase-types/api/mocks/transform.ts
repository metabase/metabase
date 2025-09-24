import type {
  Transform,
  TransformJob,
  TransformRun,
  TransformSource,
  TransformTag,
  TransformTarget,
  UpdateTransformRequest,
} from "metabase-types/api";

import { createMockStructuredDatasetQuery } from "./query";

export function createMockTransformSource(
  opts?: Partial<TransformSource>,
): TransformSource {
  return {
    type: "query",
    query: createMockStructuredDatasetQuery(),
    ...opts,
  };
}

export function createMockTransformTarget(
  opts?: Partial<TransformTarget>,
): TransformTarget {
  return {
    type: "table",
    name: "Table",
    schema: null,
    ...opts,
  };
}

export function createMockTransform(opts?: Partial<Transform>): Transform {
  return {
    id: 1,
    name: "Transform",
    description: null,
    source: createMockTransformSource(),
    target: createMockTransformTarget(),
    created_at: "2000-01-01T00:00:00Z",
    updated_at: "2000-01-01T00:00:00Z",
    ...opts,
  };
}

export function createMockTransformRun(
  opts?: Partial<TransformRun>,
): TransformRun {
  return {
    id: 1,
    status: "succeeded",
    start_time: "2000-01-01T00:00:00Z",
    end_time: "2000-01-01T00:00:00Z",
    message: null,
    run_method: "manual",
    ...opts,
  };
}

export function createMockTransformTag(
  opts?: Partial<TransformTag>,
): TransformTag {
  return {
    id: 1,
    name: "Tag",
    created_at: "2000-01-01T00:00:00Z",
    updated_at: "2000-01-01T00:00:00Z",
    ...opts,
  };
}

export function createMockTransformJob(
  opts?: Partial<TransformJob>,
): TransformJob {
  return {
    id: 1,
    name: "Job",
    description: null,
    schedule: "0 0 0 * * ? *",
    ui_display_type: "cron/builder",
    created_at: "2000-01-01T00:00:00Z",
    updated_at: "2000-01-01T00:00:00Z",
    ...opts,
  };
}

export function createMockUpdateTransformRequest(
  opts?: Partial<UpdateTransformRequest>,
): UpdateTransformRequest {
  return {
    id: 1,
    ...opts,
  };
}
