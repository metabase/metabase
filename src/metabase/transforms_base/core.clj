(ns metabase.transforms-base.core
  "Entry point for base transform execution.

   This namespace provides the main `execute!` function for running transforms
   without writing to transform_run rows. Results are returned in memory.

   For query transforms, this module handles execution directly.
   For python transforms, implementations are loaded separately via
   metabase-enterprise.transforms-python.base to avoid circular dependencies."
  (:require
   ;; Interface for dispatch
   [metabase.transforms-base.interface :as transforms-base.i]
   ;; Load query implementation - registers multimethods
   [metabase.transforms-base.query]
   [metabase.transforms-base.util :as transforms-base.u]))

(defn execute!
  "Execute transform and return result map without writing transform_run rows.

   This is the main entry point for base transform execution. Use this when you
   want to run a transform without database tracking (e.g., from workspaces).

   Performs the core execution via `execute-base!`, then runs post-processing
   (sync, events, secondary indexes) via `complete-execution!`.

   Options:
   - `:cancelled?` - (fn [] boolean), polled during execution to check for cancellation
   - `:run-id` - optional, for instrumentation/metrics (nil skips metrics recording)
   - `:with-stage-timing-fn` - optional, (fn [run-id stage thunk] result)
   - `:publish-events?` - whether to publish Metabase events (default true)

   Returns a map:
   {:status :succeeded | :failed | :cancelled | :timeout
    :result <implementation-specific result>
    :error <exception if failed>
    :logs <string, for python transforms>}

   Target table sync (metabase_table writes) still occurs - this is necessary
   for the table to be usable after execution."
  ([transform]
   (execute! transform nil))
  ([transform opts]
   (let [result (transforms-base.i/execute-base! transform opts)]
     (when (= :succeeded (:status result))
       (transforms-base.u/complete-execution! transform opts))
     result)))
