(ns metabase.search.permissions
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.config :refer [SearchContext]]
   [metabase.search.spec :as search.spec]
   [metabase.util.malli :as mu]))

(defn- assert-current-user! [missing-param]
  (assert @@(requiring-resolve 'metabase.api.common/*current-user*)
          (format "metabase.api.common/*current-user* must be bound if %s is missing from search-ctx" missing-param)))

(defn- impersonated-user? [{:keys [is-impersonated-user?] :as _search-ctx}]
  (or is-impersonated-user?
      ;; TODO Make this parameter non-optional, and fix code paths that omit it. Then remove this fallback.
      (when (nil? is-impersonated-user?)
        (assert-current-user! :is-impersonated-user?)
        (perms/impersonated-user?))))

(defn- sandboxed-user? [{:keys [is-sandboxed-user?] :as _search-ctx}]
  (or is-sandboxed-user?
      ;; TODO Make this parameter non-optional, and fix code paths that omit it. Then remove this fallback.
      (when (nil? is-sandboxed-user?)
        (assert-current-user! :is-sandboxed-user?)
        (perms/sandboxed-user?))))

(defn sandboxed-or-impersonated-user?
  "Is the current user sandboxed or impersonated?"
  [search-ctx]
  (or (impersonated-user? search-ctx) (sandboxed-user? search-ctx)))

(mu/defn permitted-collections-clause
  "Build the WHERE clause corresponding to which collections the given user has access to."
  [{:keys [archived current-user-id is-superuser?]} :- SearchContext collection-id-col :- :keyword]
  [:and
   (collection/visible-collection-filter-clause
    collection-id-col
    {:include-archived-items    :all
     :include-trash-collection? true
     :permission-level          (if archived :write :read)}
    {:current-user-id current-user-id
     :is-superuser?   is-superuser?})
   ;; This is to allow the set of namespaces indexed by the search spec for appdb-based search to also apply to
   ;; legacy search so it performs the same on MySQL
   ;; TODO(edpaget 2025-12-04): this should be a default value of the search context and then search can be restricted
   ;; to different namespaces via parameters.
   (perms/namespace-clause :collection.namespace nil true)])

(defn workspace-visibility-clause
  "HoneySQL predicate restricting `column` (the index's `workspace_id` column, `:search_index.workspace_id` by
  default) to rows visible under remote-sync workspace isolation: rows of a search model that isn't
  workspace-scoped are always visible, and rows of a workspace-scoped model are visible only when their
  workspace matches the caller's active workspace (nil for the main app)."
  ([] (workspace-visibility-clause :search_index.workspace_id))
  ([column]
   [:or
    [:not-in :search_index.model (vec (search.spec/workspace-scoped-search-models))]
    (remote-sync/workspace-visibility-clause column)]))

(mu/defn permitted-tables-clause
  "Build the WHERE clause and optional CTEs for table permission filtering.
   Returns a map with :clause (WHERE clause fragment) and :with (optional CTE definitions)."
  [{:keys [current-user-id is-superuser? is-data-analyst?]} :- SearchContext table-id-col :- [:or :keyword [:vector :keyword]]]
  (mi/visible-filter-clause
   :model/Table
   table-id-col
   {:user-id current-user-id
    :is-superuser? is-superuser?
    :is-data-analyst? is-data-analyst?}
   {:perms/view-data :unrestricted
    :perms/create-queries :query-builder}
   {:include-published-via-collection? true
    :active-only? true}))
