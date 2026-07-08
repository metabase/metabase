// TEMPORARY mock data source for the "transform graph runs" tab.
//
// The shape here mirrors the backend `GET /api/transform/runs` listing
// (`RunSummaryResponse`) and `GET /api/transform-dag-run/:id/transform-runs`
// member drill-down, but the FE still resolves against this fixture via `queryFn`
// while the backend endpoints are finalized (multi-status / multi-transform-id
// filtering is still in progress). When they land, delete this file and swap the
// endpoints' `queryFn` for a `query`.
//
// TODO(GDGT-2625): remove once the unified /api/transform/runs endpoint is wired.
import type {
  ListTransformGraphRunMembersRequest,
  ListTransformGraphRunsRequest,
  ListTransformGraphRunsResponse,
  TransformGraphRun,
  TransformRunForJobRun,
} from "metabase-types/api";

export const MOCK_TRANSFORM_GRAPH_RUNS: TransformGraphRun[] = [
  {
    run_type: "job",
    id: 101,
    entity_id: 1,
    name: "Hourly refresh",
    direction: null,
    run_method: "cron",
    status: "succeeded",
    is_active: false,
    start_time: "2026-07-07T09:00:00Z",
    end_time: "2026-07-07T09:04:00Z",
    message: null,
    user_id: null,
  },
  {
    run_type: "dag",
    id: 201,
    entity_id: 10,
    name: "Orders cleaned",
    direction: "downstream",
    run_method: "manual",
    status: "started",
    is_active: true,
    start_time: "2026-07-07T08:30:00Z",
    end_time: null,
    message: null,
    user_id: 1,
  },
  {
    run_type: "dag",
    id: 202,
    entity_id: 11,
    name: "Revenue by month",
    direction: "upstream",
    run_method: "manual",
    status: "failed",
    is_active: false,
    start_time: "2026-07-06T18:15:00Z",
    end_time: "2026-07-06T18:20:00Z",
    message: null,
    user_id: 1,
  },
  {
    run_type: "transform",
    id: 301,
    entity_id: 12,
    name: "Customers deduped",
    direction: null,
    run_method: "manual",
    status: "succeeded",
    is_active: false,
    start_time: "2026-07-06T12:00:00Z",
    end_time: "2026-07-06T12:01:30Z",
    message: null,
    user_id: 1,
  },
  {
    run_type: "job",
    id: 102,
    entity_id: 2,
    name: "Nightly rollups",
    direction: null,
    run_method: "cron",
    status: "failed",
    is_active: false,
    start_time: "2026-07-06T02:00:00Z",
    end_time: "2026-07-06T02:12:00Z",
    message: null,
    user_id: null,
  },
  {
    run_type: "transform",
    id: 302,
    entity_id: 13,
    name: "Sessions enriched",
    direction: null,
    run_method: "manual",
    status: "canceled",
    is_active: false,
    start_time: "2026-07-05T22:45:00Z",
    end_time: "2026-07-05T22:46:00Z",
    message: null,
    user_id: 1,
  },
];

const MOCK_ERROR_MESSAGE = [
  'ERROR: relation "orders" does not exist',
  "  Position: 42",
  "SQL: SELECT * FROM orders WHERE created_at >= {{checkpoint}}",
].join("\n");

function member(
  id: number,
  transform_id: number,
  transform_name: string,
  status: TransformRunForJobRun["status"],
  start_time: string,
  end_time: string | null,
): TransformRunForJobRun {
  return {
    id,
    transform_id,
    transform_name,
    job_run_id: null,
    status,
    run_method: "manual",
    start_time,
    end_time,
    // Failed runs carry an error log, mirroring the real transform-run payload.
    message: status === "failed" ? MOCK_ERROR_MESSAGE : null,
  };
}

// The member transform runs for each graph run, keyed by `${run_type}-${id}`.
const MOCK_TRANSFORM_GRAPH_RUN_MEMBERS: Record<
  string,
  TransformRunForJobRun[]
> = {
  "job-101": [
    member(
      1101,
      20,
      "Orders raw",
      "succeeded",
      "2026-07-07T09:00:00Z",
      "2026-07-07T09:02:00Z",
    ),
    member(
      1102,
      10,
      "Orders cleaned",
      "succeeded",
      "2026-07-07T09:02:00Z",
      "2026-07-07T09:04:00Z",
    ),
  ],
  "job-102": [
    member(
      1201,
      21,
      "Revenue rollup",
      "failed",
      "2026-07-06T02:00:00Z",
      "2026-07-06T02:12:00Z",
    ),
  ],
  "dag-201": [
    member(
      2101,
      10,
      "Orders cleaned",
      "succeeded",
      "2026-07-07T08:30:00Z",
      "2026-07-07T08:33:00Z",
    ),
    member(
      2102,
      22,
      "Orders enriched",
      "started",
      "2026-07-07T08:33:00Z",
      null,
    ),
  ],
  "dag-202": [
    member(
      2201,
      10,
      "Orders cleaned",
      "succeeded",
      "2026-07-06T18:15:00Z",
      "2026-07-06T18:17:00Z",
    ),
    member(
      2202,
      11,
      "Revenue by month",
      "failed",
      "2026-07-06T18:17:00Z",
      "2026-07-06T18:20:00Z",
    ),
  ],
  "transform-301": [
    member(
      3101,
      12,
      "Customers deduped",
      "succeeded",
      "2026-07-06T12:00:00Z",
      "2026-07-06T12:01:30Z",
    ),
  ],
  "transform-302": [
    member(
      3201,
      13,
      "Sessions enriched",
      "canceled",
      "2026-07-05T22:45:00Z",
      "2026-07-05T22:46:00Z",
    ),
  ],
};

function memberKey(run: Pick<TransformGraphRun, "run_type" | "id">): string {
  return `${run.run_type}-${run.id}`;
}

// The transform ids a root run "contains": its member transforms plus, for
// dag/transform runs, the seed/target transform itself.
function runTransformIds(run: TransformGraphRun): number[] {
  const members = MOCK_TRANSFORM_GRAPH_RUN_MEMBERS[memberKey(run)] ?? [];
  const ids = members
    .map((m) => m.transform_id)
    .filter((id): id is number => id != null);
  if (run.run_type !== "job" && run.entity_id != null) {
    ids.push(run.entity_id);
  }
  return ids;
}

export function getMockTransformGraphRunMembers({
  run_type,
  id,
}: ListTransformGraphRunMembersRequest): TransformRunForJobRun[] {
  return MOCK_TRANSFORM_GRAPH_RUN_MEMBERS[`${run_type}-${id}`] ?? [];
}

export function getMockTransformGraphRunsResponse(
  params: ListTransformGraphRunsRequest,
): ListTransformGraphRunsResponse {
  const {
    types,
    statuses,
    "transform-ids": transformIds,
    "sort-column": sortColumn = "start_time",
    "sort-direction": sortDirection = "desc",
    limit,
    offset = 0,
  } = params;

  const filtered = MOCK_TRANSFORM_GRAPH_RUNS.filter((run) => {
    if (types != null && types.length > 0 && !types.includes(run.run_type)) {
      return false;
    }
    if (
      statuses != null &&
      statuses.length > 0 &&
      (run.status == null || !statuses.includes(run.status))
    ) {
      return false;
    }
    if (transformIds != null && transformIds.length > 0) {
      const involved = runTransformIds(run);
      if (!transformIds.some((id) => involved.includes(id))) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aValue = a[sortColumn] ?? "";
    const bValue = b[sortColumn] ?? "";
    const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const start = offset ?? 0;
  const data =
    limit != null ? sorted.slice(start, start + limit) : sorted.slice(start);

  return {
    data,
    total: sorted.length,
    limit: limit ?? null,
    offset: start,
  };
}
