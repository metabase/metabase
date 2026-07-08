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

// Every run type (job / dag / transform) in every state (succeeded / started /
// failed / timeout), so the UI can be exercised against all combinations.
export const MOCK_TRANSFORM_GRAPH_RUNS: TransformGraphRun[] = [
  // --- Job runs ---
  {
    run_type: "job",
    id: 101,
    entity_id: 1,
    name: "Hourly refresh",
    direction: null,
    run_method: "cron",
    status: "succeeded",
    is_active: false,
    start_time: "2026-07-08T09:00:00Z",
    end_time: "2026-07-08T09:04:00Z",
    message: null,
    user_id: null,
  },
  {
    run_type: "job",
    id: 102,
    entity_id: 2,
    name: "Nightly rollups",
    direction: null,
    run_method: "cron",
    status: "started",
    is_active: true,
    start_time: "2026-07-08T08:50:00Z",
    end_time: null,
    message: null,
    user_id: null,
  },
  {
    run_type: "job",
    id: 103,
    entity_id: 3,
    name: "Weekly archive",
    direction: null,
    run_method: "cron",
    status: "failed",
    is_active: false,
    start_time: "2026-07-08T02:00:00Z",
    end_time: "2026-07-08T02:12:00Z",
    message: null,
    user_id: null,
  },
  {
    run_type: "job",
    id: 104,
    entity_id: 4,
    name: "Monthly export",
    direction: null,
    run_method: "cron",
    status: "timeout",
    is_active: false,
    start_time: "2026-07-07T23:00:00Z",
    end_time: "2026-07-08T00:00:00Z",
    message: null,
    user_id: null,
  },
  // --- DAG-reprocess runs ---
  {
    run_type: "dag",
    id: 201,
    entity_id: 10,
    name: "Orders cleaned",
    direction: "downstream",
    run_method: "manual",
    status: "succeeded",
    is_active: false,
    start_time: "2026-07-08T08:30:00Z",
    end_time: "2026-07-08T08:34:00Z",
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
    status: "started",
    is_active: true,
    start_time: "2026-07-08T08:20:00Z",
    end_time: null,
    message: null,
    user_id: 1,
  },
  {
    run_type: "dag",
    id: 203,
    entity_id: 12,
    name: "Customers deduped",
    direction: "upstream",
    run_method: "manual",
    status: "failed",
    is_active: false,
    start_time: "2026-07-07T18:15:00Z",
    end_time: "2026-07-07T18:20:00Z",
    message: null,
    user_id: 1,
  },
  {
    run_type: "dag",
    id: 204,
    entity_id: 13,
    name: "Sessions enriched",
    direction: "downstream",
    run_method: "manual",
    status: "timeout",
    is_active: false,
    start_time: "2026-07-07T16:00:00Z",
    end_time: "2026-07-07T17:00:00Z",
    message: null,
    user_id: 1,
  },
  // --- Standalone transform runs ---
  {
    run_type: "transform",
    id: 301,
    entity_id: 20,
    name: "Products normalized",
    direction: null,
    run_method: "manual",
    status: "succeeded",
    is_active: false,
    start_time: "2026-07-08T07:00:00Z",
    end_time: "2026-07-08T07:01:30Z",
    message: null,
    user_id: 1,
  },
  {
    run_type: "transform",
    id: 302,
    entity_id: 21,
    name: "Inventory snapshot",
    direction: null,
    run_method: "manual",
    status: "started",
    is_active: true,
    start_time: "2026-07-08T06:45:00Z",
    end_time: null,
    message: null,
    user_id: 1,
  },
  {
    run_type: "transform",
    id: 303,
    entity_id: 22,
    name: "Payments reconciled",
    direction: null,
    run_method: "manual",
    status: "failed",
    is_active: false,
    start_time: "2026-07-07T12:00:00Z",
    end_time: "2026-07-07T12:02:00Z",
    message: null,
    user_id: 1,
  },
  {
    run_type: "transform",
    id: 304,
    entity_id: 23,
    name: "Events deduped",
    direction: null,
    run_method: "manual",
    status: "timeout",
    is_active: false,
    start_time: "2026-07-07T10:00:00Z",
    end_time: "2026-07-07T10:30:00Z",
    message: null,
    user_id: 1,
  },
];

const MOCK_ERROR_MESSAGE = [
  'ERROR: relation "orders" does not exist',
  "  Position: 42",
  "SQL: SELECT * FROM orders WHERE created_at >= {{checkpoint}}",
].join("\n");

const MOCK_TIMEOUT_MESSAGE =
  "Run exceeded the maximum allowed duration and was timed out.";

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
    // Failed / timed-out runs carry a log, mirroring the real transform-run payload.
    message:
      status === "failed"
        ? MOCK_ERROR_MESSAGE
        : status === "timeout"
          ? MOCK_TIMEOUT_MESSAGE
          : null,
  };
}

// Member transform runs for a root run. A standalone transform run is its own
// single member; job/DAG runs get a completed dependency plus a final member that
// carries the root run's status (so failed/timeout runs surface an error log).
function buildMembers(run: TransformGraphRun): TransformRunForJobRun[] {
  const base = run.id * 10;
  const name = run.name ?? "Transform";
  const status = run.status ?? "succeeded";

  if (run.run_type === "transform") {
    return [
      member(
        base + 1,
        run.entity_id ?? base,
        name,
        status,
        run.start_time,
        run.end_time,
      ),
    ];
  }

  return [
    member(
      base + 1,
      800 + run.id,
      `${name} dependency`,
      "succeeded",
      run.start_time,
      run.start_time,
    ),
    member(
      base + 2,
      run.entity_id ?? 900 + run.id,
      name,
      status,
      run.start_time,
      run.end_time,
    ),
  ];
}

function memberKey(run: Pick<TransformGraphRun, "run_type" | "id">): string {
  return `${run.run_type}-${run.id}`;
}

const MOCK_TRANSFORM_GRAPH_RUN_MEMBERS: Record<
  string,
  TransformRunForJobRun[]
> = Object.fromEntries(
  MOCK_TRANSFORM_GRAPH_RUNS.map((run) => [memberKey(run), buildMembers(run)]),
);

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
    "run-methods": runMethods,
    "sort-column": sortColumn = "start_time",
    "sort-direction": sortDirection = "desc",
    limit,
    offset = 0,
  } = params;

  // NOTE: start-time / end-time are accepted but not applied here — the fixture is
  // small and relative-date parsing lives on the backend; they narrow real results.
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
    if (
      runMethods != null &&
      runMethods.length > 0 &&
      (run.run_method == null || !runMethods.includes(run.run_method))
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
