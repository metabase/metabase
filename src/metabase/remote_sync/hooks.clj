(ns metabase.remote-sync.hooks
  "Hooks that keep synced content read-only on a read-only instance, implemented by the enterprise module."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise after-insert
  "Hook for `row` of `model` after it is inserted, which does nothing without remote sync."
  metabase-enterprise.remote-sync.hooks
  [_model _row]
  nil)

(defenterprise before-update
  "Hook for `row` of `model` before it is updated, which does nothing without remote sync."
  metabase-enterprise.remote-sync.hooks
  [_model _row]
  nil)

(defenterprise before-delete
  "Hook for `row` of `model` before it is deleted, which does nothing without remote sync."
  metabase-enterprise.remote-sync.hooks
  [_model _row]
  nil)
