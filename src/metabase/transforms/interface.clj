(ns metabase.transforms.interface
  (:require
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util.namespaces :as shared.ns]))

;; Re-export pure multimethods from transforms-base for backwards compatibility.
;; Existing callers (defmethods and call sites) do not need to change.
(shared.ns/import-fns
 [metabase.transforms-base.interface
  source-db-id
  target-db-id
  table-dependencies])

(defmulti execute!
  "Execute a transform operation. Runs the actual transformation process, which might involve running SQL queries,
  Python scripts, or other transformation logic depending on the transform type.

  This method blocks and may take significant time depending on the data volume. Implementations
  should handle errors gracefully and provide appropriate logging.

  Returns nil (or a result that can be discarded).

  Options:
  - `:start-promise`
     Will have a `transform_run.run_id` value delivered once the execution is registered with the database.
     Callers can await this promise to identify the transform_run record, which enables progress / status monitoring.

  - `:run-method`
     Expected to be either `:cron` (for scheduled runs) or `:manual` (for ad-hoc or test runs)
     Used for instrumentation / metadata purposes.

  - `:user-id`
     Optional user ID to attribute the run to. For manual runs, this should be the ID of the user who
     triggered the run. For cron/scheduled runs, this is typically nil, and the run will be attributed
     to the transform's owner (if set) or creator.

  Do not use this directly. Use [[metabase.transforms.execute/execute!]] instead."
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transforms-base.i/transform->transform-type transform)))
