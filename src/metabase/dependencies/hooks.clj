(ns metabase.dependencies.hooks
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module; models
  whose writes change dependencies derive from `:hook/dependencies`."
  (:require
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-delete :as t2.before-delete]
   [toucan2.tools.before-insert :as t2.before-insert]
   [toucan2.tools.before-update :as t2.before-update]))

(defn- dispatch-model
  "The `model` to dispatch a hook on, or `:default` without the dependencies feature."
  [model _instance]
  (if (premium-features/has-feature? :dependencies)
    model
    :default))

(defmulti before-insert
  "Hook for the `model` row `instance` before it is inserted."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmulti before-update
  "Hook for the `model` row `instance` before it is updated, whose Toucan changes say what changes."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmulti before-delete
  "Hook for the `model` row `instance` before it is deleted."
  {:arglists '([model instance])}
  #'dispatch-model)

(defmethod before-insert :default [_model _instance] nil)
(defmethod before-update :default [_model _instance] nil)
(defmethod before-delete :default [_model _instance] nil)

(doseq [hook [:hook/timestamped? :hook/created-at-timestamped? :hook/updated-at-timestamped? :hook/entity-id]]
  (methodical/prefer-method! #'t2.before-insert/before-insert hook :hook/dependencies))

(doseq [hook [:hook/timestamped? :hook/updated-at-timestamped?]]
  (methodical/prefer-method! #'t2.before-update/before-update hook :hook/dependencies))

(t2/define-before-insert :hook/dependencies
  [instance]
  (before-insert &model instance)
  instance)

(t2/define-before-update :hook/dependencies
  [instance]
  (before-update &model instance)
  instance)

(t2/define-before-delete :hook/dependencies
  [instance]
  instance)

(methodical/defmethod t2.before-delete/before-delete :before :hook/dependencies
  [model instance]
  (before-delete model instance)
  instance)

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
