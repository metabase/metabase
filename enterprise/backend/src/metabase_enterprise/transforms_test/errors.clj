(ns metabase-enterprise.transforms-test.errors
  "Canonical `:error-type` vocabulary for transform test runs. Every typed
  `ex-info` thrown across the pipeline carries one of these keywords under
  `:error-type`.")

(def all
  "The full set of `:error-type` keywords the test-run pipeline can throw.
  Not every error-type has a dedicated HTTP mapping."
  #{;; Fixture-CSV parsing.
    ::header-mismatch             ; CSV header does not match the target table's columns (exact match), or contains duplicates.
    ::unparseable-cell           ; A CSV cell cannot be parsed as its column's type.
    ::ragged-row                 ; A CSV data row has more or fewer cells than the header.
    ;; Diff options.
    ::unknown-ignore-columns     ; `:ignore-columns` names a column not present in the actual result.
    ;; Diff canonicalization.
    ::cannot-canonicalize        ; A cell value could not be canonicalized for comparison.
    ;; Input resolution.
    ::missing-fixtures           ; A required input table has no fixture key in the provided set.
    ::unknown-fixture-keys       ; A provided fixture key matches no required table.
    ::unsupported-transform-type ; Transform source type is not `:query` (e.g. `:python`); also raised at resolve time.
    ::cannot-determine-inputs    ; Dependency extraction threw; inputs could not be computed.
    ::table-not-found            ; A table dependency has no matching synced Table row.
    ::transform-dep-not-supported ; A dep on another transform's (unmaterialized) output is not testable.
    ;; Resolve / compile.
    ::cannot-test-run            ; A verify guard failed, or compile/rewrite of the transform failed.
    ;; Scratch-table lifecycle.
    ::seed-failed                ; Seeding fixture data into a scratch table failed.
    ;; Execution.
    ::pre-execution-guard-failed ; A pre-execution guard rejected the resolved artifact.
    ::execution-failed           ; Running the transform, or a chained node, failed; also raised at chain level.
    ;; Sub-graph resolution.
    ::sources-not-ancestors      ; A selected source transform is not an ancestor of the target.
    ::cycle                      ; The selected slice contains a dependency cycle.
    ;; Chained (multi-node) runs.
    ::cross-database-subgraph    ; Slice nodes span more than one source database.
    ::target-not-found           ; The target transform id does not resolve.
    ::missing-database-id        ; The target has no source database id.
    ;; Assertions.
    ::assertion-execution-failed ; The combined assertion query failed to execute.
    ;; Request parsing (HTTP layer).
    ::assertions-parse-error})   ; The `assertions` multipart part was malformed at parse time.
