(ns metabase.transforms-base.core
  "Entry point for pure transform execution — no transform_run lifecycle.

  Dispatches to the appropriate `execute-base!` multimethod implementation
  based on the transform's source type (:query, :python, etc.).

  Options:
  - `:cancelled?`          — zero-arg fn returning truthy if execution should abort
  - `:run-id`              — optional opaque id for instrumentation
  - `:with-stage-timing-fn` — optional (fn [stage-key thunk]) for timing stages"
  (:require
   [metabase.transforms-base.interface :as transforms-base.i]
   ;; Require query impl so the :query defmethod is registered.
   ;; NOTE: :python defmethod lives in enterprise/transforms_python/base.clj
   ;; and is only available when the enterprise jar is loaded.
   [metabase.transforms-base.query]))

(defn execute!
  "Execute a transform's core logic and return an in-memory result map.

  See [[metabase.transforms-base.interface/execute-base!]] for the return contract."
  ([transform]
   (execute! transform nil))
  ([transform opts]
   (transforms-base.i/execute-base! transform opts)))
