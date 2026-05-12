export type ProposalKind = "rewrite" | "index" | "precompute";

export type ProposalSeverity = "high" | "medium" | "low";

export type DdlTarget = "source-db" | "transform-target";

export type DdlValidation = "accepted" | "rejected";

export type DdlExecutionStatus =
  | "pending"
  | "running"
  | "executed"
  | "failed"
  | "skipped";

/**
 * The single DDL attached to a `kind: "index"` proposal. Indices that
 * target a new table created by another proposal use
 * `target: "transform-target"` and the parent proposal's id in
 * `depends_on`.
 */
export type DdlStatement = {
  target: DdlTarget;
  statement: string;
  rationale: string;
  validation: DdlValidation;
  index_name?: string | null;
  rejection?: { reason: string; detail?: string } | null;
};

/**
 * One change per proposal:
 *   - `rewrite` / `precompute` carry `body`, no `ddl_statement`.
 *   - `index` carries `ddl_statement`, no `body`.
 *
 * Indices that depend on a new target table express that via
 * `depends_on` plus `ddl_statement.target = "transform-target"` — the FE
 * walks `depends_on` to topo-order accept requests.
 */
export type Proposal = {
  id: string;
  name: string;
  kind: ProposalKind;
  severity: ProposalSeverity;
  rationale: string;
  expected_speedup: string;
  body: string | null;
  ddl_statement: DdlStatement | null;
  depends_on: string[];
};

export type OptimizerStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "aborted";

export type OptimizerStreamError = {
  message: string;
  retryable: boolean;
};

export type OptimizerStreamState = {
  status: OptimizerStreamStatus;
  summary: string | null;
  proposals: Proposal[];
  optimizationDegree: number | null;
  error: OptimizerStreamError | null;
};

export type OptimizerStreamEvent =
  | { event: "summary"; data: { text: string } }
  | { event: "proposal"; data: Proposal }
  | { event: "done"; data: { optimization_degree: number } }
  | { event: "error"; data: OptimizerStreamError };

/**
 * One row from `GET /api/ee/transform-optimizer/:id/indexes`. Matches the
 * Postgres catalog shape returned by `index-introspection/fetch-indexes`,
 * plus:
 *   - `is_target_table` — true when the index lives on the transform's
 *     materialised target, false when it's on a source (input) table
 *   - `managed_by_optimizer` — true when the index is replayed by the
 *     optimizer's `target.post_run_ddl` machinery (only ever true for
 *     target-table indices)
 */
export type TargetIndex = {
  schema: string;
  table: string;
  name: string;
  access_method: string;
  is_unique: boolean;
  is_primary: boolean;
  is_valid: boolean;
  partial_predicate: string | null;
  index_expressions: string | null;
  definition: string;
  key_columns: string[];
  include_columns: string[];
  managed_by_optimizer: boolean;
  is_target_table: boolean;
};

export type DropIndexResult =
  | { status: "dropped" }
  | { status: "failed"; error_message: string; error?: string }
  | {
      status: "skipped";
      reason:
        | "index-not-on-referenced-table"
        | "unsafe-name"
        | "no-database"
        | "not-postgres";
      error?: string;
    };
