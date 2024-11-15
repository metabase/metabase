(ns metabase.search.permissions
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.models.collection :as collection]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :refer [SearchContext]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- assert-current-user! [missing-param]
  (assert @@(requiring-resolve 'metabase.api.common/*current-user*)
          (format "metabase.api.common/*current-user* must be bound if %s is missing from search-ctx" missing-param)))

(defn- impersonated-user? [{:keys [is-impersonated-user?] :as _search-ctx}]
  (or is-impersonated-user?
      ;; TODO Make this parameter non-optional, and fix code paths that omit it. Then remove this fallback.
      (when (nil? is-impersonated-user?)
        (assert-current-user! :is-impersonated-user?)
        (premium-features/impersonated-user?))))

(defn- sandboxed-user? [{:keys [is-sandboxed-user?] :as _search-ctx}]
  (or is-sandboxed-user?
      ;; TODO Make this parameter non-optional, and fix code paths that omit it. Then remove this fallback.
      (when (nil? is-sandboxed-user?)
        (assert-current-user! :is-sandboxed-user?)
        (premium-features/sandboxed-user?))))

(defn sandboxed-or-impersonated-user?
  "Is the current user sandboxed or impersonated?"
  [search-ctx]
  (or (impersonated-user? search-ctx) (sandboxed-user? search-ctx)))

(mu/defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [honeysql-query :- :map
   model :- [:maybe :string]
   {:keys [filter-items-in-personal-collection
           archived
           current-user-id
           is-superuser?]} :- SearchContext]
  (let [collection-id-col        (case model
                                   "collection"   :collection.id
                                   "search-index" :search_index.collection_id
                                   :collection_id)
        collection-filter-clause (collection/visible-collection-filter-clause
                                  collection-id-col
                                  {:include-archived-items    :all
                                   :include-trash-collection? true
                                   :permission-level          (if archived
                                                                :write
                                                                :read)}
                                  {:current-user-id current-user-id
                                   :is-superuser?   is-superuser?})]
    (cond-> honeysql-query
      true
      (sql.helpers/where collection-filter-clause (perms/audit-namespace-clause :collection.namespace nil))
      ;; add a JOIN against Collection *unless* the source table is already Collection
      (not= model "collection")
      (sql.helpers/left-join [:collection :collection]
                             [:= collection-id-col :collection.id])

      ;; TODO This is not really about permissions, it should really be handled in search.filter
      (some? filter-items-in-personal-collection)
      (sql.helpers/where
       (case filter-items-in-personal-collection
         "only"
         (concat [:or]
                 ;; sub personal collections
                 (for [id (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil])]
                   [:like :collection.location (format "/%d/%%" id)])
                 ;; top level personal collections
                 [[:and
                   [:= :collection.location "/"]
                   [:not= :collection.personal_owner_id nil]]])

         "exclude"
         (conj [:or]
               (into
                [:and [:= :collection.personal_owner_id nil]]
                (for [id (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil])]
                  [:not-like :collection.location (format "/%d/%%" id)]))
               [:= collection-id-col nil]))))))
