(ns metabase-enterprise.transforms-verification.errors
  "Canonical `:error-type` vocabulary for transform test runs, and [[ex]], the
  constructor every typed throw goes through. Every typed `ex-info` thrown
  across the pipeline carries one of the [[all]] keywords under `:error-type`;
  untyped throws (no `:error-type`) use raw `ex-info`.")

(set! *warn-on-reflection* true)

(def all
  "The full set of `:error-type` keywords the test-run pipeline can throw."
  #{;; Fixture-CSV parsing.
    ::header-mismatch             ; CSV header does not match the target table's columns (exact match), or contains duplicates.
    ::unparseable-cell           ; A CSV cell cannot be parsed as its column's type.
    ::ragged-row                 ; A CSV data row has more or fewer cells than the header.
    ::empty-target-schema        ; The target/leaf table has no columns.
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

(defn checked
  "Return `error-type` iff it is a member of [[all]]; otherwise throw."
  [error-type]
  (when-not (contains? all error-type)
    (throw (ex-info (str error-type " is not a declared test-run error type; see"
                         " metabase-enterprise.transforms-verification.errors/all.")
                    {:invalid-error-type error-type})))
  error-type)

(defmacro ex
  "Construct (not throw) the typed test-run ExceptionInfo: `error-type` is assoc'd
  into `data` under `:error-type` and must be a member of [[all]] — a literal
  keyword is checked at macro-expansion time (a typo fails the build), a computed
  one at runtime.

    (throw (errors/ex ::errors/cannot-test-run msg {:guard g}))
    (throw (errors/ex ::errors/seed-failed msg {} cause))"
  ([error-type msg data]
   `(ex ~error-type ~msg ~data nil))
  ([error-type msg data cause]
   (if (keyword? error-type)
     (do (checked error-type)
         `(ex-info ~msg (assoc ~data :error-type ~error-type) ~cause))
     `(ex-info ~msg (assoc ~data :error-type (checked ~error-type)) ~cause))))
