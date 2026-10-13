(ns metabase.dependencies.hooks
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise before-insert
  "Hook for the `model` row `instance` before it is inserted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise before-update
  "Hook for the `model` row `instance` before it is updated, whose Toucan changes say what changes. The OSS
  implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise before-delete
  "Hook for the `model` row `instance` before it is deleted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise after-database-sync
  "Hook for the Database with `database-id` after a sync. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_database-id]
  nil)

(defenterprise after-premium-token-update
  "Hook for after the premium token changed, which may have enabled the dependencies feature. The OSS implementation is
  a no-op."
  metabase-enterprise.dependencies.hooks
  []
  nil)

(defenterprise after-transform-run
  "Hook for the transform with `transform-id` after a run wrote its output table `table-name` in `schema` of the
  Database with `db-id`. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_transform-id _db-id _schema _table-name]
  nil)
