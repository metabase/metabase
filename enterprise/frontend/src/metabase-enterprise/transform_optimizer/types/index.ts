export type ProposalKind =
  | "rewrite"
  | "index"
  | "rewrite+index"
  | "precompute";

export type ProposalSeverity = "high" | "medium" | "low";

export type DdlTarget =
  | "source-db"
  | "transform-target"
  | { "precompute-of": string };

export type DdlValidation = "accepted" | "rejected";

export type DdlExecutionStatus =
  | "pending"
  | "running"
  | "executed"
  | "failed"
  | "skipped";

export type DdlStatement = {
  id: string;
  target: DdlTarget;
  statement: string;
  rationale: string;
  validation: DdlValidation;
  index_name?: string | null;
  rejection?: { reason: string; detail?: string } | null;
  /**
   * Local-only execution state for the UI. Server emits this in the advisory
   * "validation" field, but in this branch DDL is never run by Metabase,
   * so the value stays "pending" unless the user uses Run DDL.
   */
  execution_status?: DdlExecutionStatus;
  execution_error?: string | null;
};

export type Proposal = {
  id: string;
  name: string;
  kind: ProposalKind;
  severity: ProposalSeverity;
  rationale: string;
  expected_speedup: string;
  body: string | null;
  depends_on: string[];
  ddl_statements: DdlStatement[];
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
