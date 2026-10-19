(ns metabase.dependencies.hooks
  "Hooks that have the dependency jobs triggered as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise before-insert
  "Hook for the `model` row `instance` before it is inserted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise before-update
  "Hook for the `model` row `instance` before it is updated. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise before-delete
  "Hook for the `model` row `instance` before it is deleted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise after-premium-token-update
  "Hook for after the premium token changed, which may have enabled the dependencies feature. The OSS implementation is
  a no-op."
  metabase-enterprise.dependencies.hooks
  []
  nil)

(defenterprise after-transform-run
  "Hook for the transform with `transform-id` after a run wrote its output Table with `table-id`, or nil when the
  table was not synced. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_transform-id _table-id]
  nil)

(defenterprise do-with-batched-marks
  "Run `thunk`, with the dependents of what its writes change marked once each when it ends. The OSS implementation
  just runs it."
  metabase-enterprise.dependencies.hooks
  [thunk]
  (thunk))

(defmacro with-batched-marks
  "Run `body`, with the dependents of what its writes change marked once each when it ends, for a batch of writes
  such as a sync's."
  [& body]
  `(do-with-batched-marks (fn [] ~@body)))
