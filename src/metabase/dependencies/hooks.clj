(ns metabase.dependencies.hooks
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]))

(defn- dispatch-model
  "The `model` to dispatch a hook on, or `:default` without the dependencies feature."
  [model _instance]
  (if (premium-features/has-feature? :dependencies)
    model
    :default))

(defmulti entity-inserted!
  "Hook for the `model` row `instance` before it is inserted."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmulti entity-updated!
  "Hook for the `model` row `instance` before it is updated, whose Toucan changes say what changes."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmulti entity-deleted!
  "Hook for the `model` row `instance` before it is deleted."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmethod entity-inserted! :default [_model _instance] nil)
(defmethod entity-updated! :default [_model _instance] nil)
(defmethod entity-deleted! :default [_model _instance] nil)

(defenterprise database-synced!
  "Hook for the Database with `database-id` after a sync. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_database-id]
  nil)

(defenterprise premium-token-updated!
  "Hook for after the premium token changed, which may have enabled the dependencies feature. The OSS implementation is
  a no-op."
  metabase-enterprise.dependencies.hooks
  []
  nil)

(defenterprise transform-executed!
  "Hook for the transform with `transform-id` after a run wrote its output table `table-name` in `schema` of the
  Database with `db-id`. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_transform-id _db-id _schema _table-name]
  nil)
