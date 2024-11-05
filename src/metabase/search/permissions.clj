(ns metabase.search.permissions
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.models.collection :as collection]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :refer [SearchContext]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn sandboxed-or-impersonated-user?
  "Is the current user sandboxed or impersonated?"
  ;; TODO take the current user as a parameter, and override the binding if necessary.
  []
  ;; TODO FIXME -- search actually currently still requires [[metabase.api.common/*current-user*]] to be bound,
  ;; because [[metabase.public-settings.premium-features/sandboxed-or-impersonated-user?]] requires it to be bound.
  ;; Since it's part of the search context it would be nice if we could run search without having to bind that stuff at
  ;; all.
  (assert @@(requiring-resolve 'metabase.api.common/*current-user*)
          "metabase.api.common/*current-user* must be bound in order to use search for an indexed entity")
  (premium-features/sandboxed-or-impersonated-user?))

(mu/defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [honeysql-query :- :map
   model :- [:maybe :string]
   {:keys [filter-items-in-personal-collection
           archived
           current-user-id
           is-superuser?]} :- SearchContext]
  (let [collection-id-col        (if (= model "collection")
                                   :collection.id
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
