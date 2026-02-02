(ns metabase-enterprise.transforms.interface
  "Interface for scheduled transform execution.

   For core interface methods (source-db-id, target-db-id, table-dependencies),
   use metabase-enterprise.transforms-base.interface directly.

   This namespace defines the scheduled-execution-specific `execute!` multimethod
   which handles transform_run tracking."
  (:require
   [metabase-enterprise.transforms-base.interface :as transforms-base.i]))

;; Scheduled execution multimethod - dispatches on transform type
;; This is separate from transforms-base.i/execute-base! which does NOT track transform_run
(defmulti execute!
  "Execute a transform operation with transform_run tracking.

  This method creates transform_run rows, tracks status, and handles cancellation.
  For base execution without database tracking, use transforms-base.i/execute-base! instead.

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

  Do not use this directly. Use [[metabase-enterprise.transforms.execute/execute!]] instead."
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transforms-base.i/transform->transform-type transform)))
