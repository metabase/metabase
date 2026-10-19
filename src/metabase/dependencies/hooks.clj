(ns metabase.dependencies.hooks
  "Hooks that have the dependency jobs triggered as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise before-insert
  "Hook for `row` of `model` before it is inserted, which does nothing without the dependencies feature."
  metabase-enterprise.dependencies.hooks
  [_model _row]
  nil)

(defenterprise before-update
  "Hook for `row` of `model` before it is updated, which does nothing without the dependencies feature."
  metabase-enterprise.dependencies.hooks
  [_model _row]
  nil)

(defenterprise before-delete
  "Hook for `row` of `model` before it is deleted, which does nothing without the dependencies feature."
  metabase-enterprise.dependencies.hooks
  [_model _row]
  nil)

(defenterprise after-premium-token-update
  "Hook for after the premium token changed, which may have enabled the dependencies feature, and does nothing without
  it."
  metabase-enterprise.dependencies.hooks
  []
  nil)

(defenterprise after-transform-run
  "Hook for the transform with `transform-id` after a run wrote its output Table with `table-id`, or nil when the
  table was not synced, which does nothing without the dependencies feature."
  metabase-enterprise.dependencies.hooks
  [_transform-id _table-id]
  nil)

(defenterprise do-with-batched-marks
  "Run `thunk`, with the dependents of what its writes change marked once each when it ends."
  metabase-enterprise.dependencies.hooks
  [thunk]
  (thunk))

(defmacro with-batched-marks
  "Run `body`, with the dependents of what its writes change marked once each when it ends, for a batch of writes
  such as a sync's."
  [& body]
  `(do-with-batched-marks (fn [] ~@body)))
