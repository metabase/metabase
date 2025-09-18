import type {
  Transform,
  TransformJob,
  TransformRun,
  TransformSource,
  TransformTag,
  TransformTarget,
} from "metabase-types/api";

import { createMockStructuredDatasetQuery } from "./query";

export function createMockTransformSource(): TransformSource {
  return {
    type: "query",
    query: createMockStructuredDatasetQuery(),
  };
}

export function createMockPythonTransformSource(): TransformSource {
  return {
    type: "python",
    script: "# Python script\nprint('Hello, world!')",
    database: 1,
    table: 1,
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
    created_at: "2000-01-01T00:00:00Z",
    updated_at: "2000-01-01T00:00:00Z",
    ...opts,
  };
}
