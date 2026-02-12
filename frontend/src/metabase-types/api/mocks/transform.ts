import type {
  DatabaseId,
  InspectorCard,
  ListTransformRunsResponse,
  PythonTransformTableAliases,
  Transform,
  TransformInspectSource,
  TransformJob,
  TransformOwner,
  TransformRun,
  TransformSource,
  TransformTag,
  TransformTarget,
  UpdateTransformRequest,
} from "metabase-types/api";

import {
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
} from "./query";

export function createMockTransformOwner(
  opts?: Partial<TransformOwner>,
): TransformOwner {
  return {
    id: 1,
    email: "owner@example.com",
    first_name: "Test",
    last_name: "Owner",
    ...opts,
  };
}

export function createMockTransformSource(): TransformSource {
  return {
    type: "query",
    query: createMockStructuredDatasetQuery(),
  };
}

export function createMockPythonTransformSource({
  sourceDatabase = 1,
  sourceTables = {},
  body = "# Python script\nprint('Hello, world!')",
}: {
  sourceDatabase?: DatabaseId;
  sourceTables?: PythonTransformTableAliases;
  body?: string;
}): TransformSource {
  return {
    type: "python",
    body,
    "source-database": sourceDatabase,
    "source-tables": sourceTables,
  };
}

export function createMockTransformTarget(
  opts?: Partial<TransformTarget>,
): TransformTarget {
  const base = {
    type: "table" as const,
    name: "Table",
    schema: null,
    database: 1,
  };

  if (opts?.type === "table-incremental") {
    return {
      ...base,
      ...opts,
      type: "table-incremental",
      "target-incremental-strategy": opts["target-incremental-strategy"] ?? {
        type: "append",
      },
    };
  }

  return {
    ...base,
    ...opts,
    type: "table",
  };
}

export function createMockTransform(opts?: Partial<Transform>): Transform {
  const source = opts?.source ?? createMockTransformSource();

  function getSourceType() {
    if (source.type === "python") {
      return "python";
    } else if (source.type === "query" && "query" in source) {
      return "native";
    }

    return "mbql";
  }

  return {
    id: 1,
    name: "Transform",
    description: null,
    source: createMockTransformSource(),
    source_type: opts?.source_type ?? getSourceType(),
    target: opts?.target ?? createMockTransformTarget(),
    collection_id: null,
    created_at: "2000-01-01T00:00:00Z",
    updated_at: "2000-01-01T00:00:00Z",
    source_readable: true,
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

export function createMockListTransformRunsResponse(
  opts?: Partial<ListTransformRunsResponse>,
): ListTransformRunsResponse {
  return {
    data: [],
    total: 0,
    limit: null,
    offset: null,
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
    can_run: true,
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

export function createMockTransformInspectSource(
  opts?: Partial<TransformInspectSource>,
): TransformInspectSource {
  return {
    table_name: "Table",
    column_count: 0,
    fields: [],
    ...opts,
  };
}

export function createMockInspectorCard(
  opts?: Partial<InspectorCard>,
): InspectorCard {
  return {
    id: "card-1",
    title: "Card",
    display: "scalar",
    dataset_query: createMockNativeDatasetQuery(),
    ...opts,
  };
}
