(ns metabase-enterprise.data-studio.permissions.published-tables
  "Enterprise implementation of published table permissions.
  Provides query access to published tables via collection permissions."
  (:require
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defenterprise published-table-permissions
  "The `perm-type` value that publishing grants the user of `user-info` on each of the Tables with `table-ids`, as
  `{table-id value}` holding only the Tables it grants one: `:query-builder` for `:perms/create-queries` on a Table
  published into a Collection they read, from one query for the published Tables and one for their Collections."
  :feature :library
  [user-info perm-type table-ids]
  (when (and (= perm-type :perms/create-queries) (seq table-ids))
    (let [table-id->collection-id (data-studio.db/published-table-collection-ids (vec table-ids))
          permissions             (perms/collection-permissions-for-user user-info
                                                                         (vec (distinct (vals table-id->collection-id)))
                                                                         {:root-namespace nil})]
      (into {}
            (keep (fn [[table-id collection-id]]
                    (when (perms/collection-permission-at-least? (get permissions collection-id) :read)
                      [table-id :query-builder])))
            table-id->collection-id))))

(defenterprise user-has-any-published-table-permission?
  "Returns true if user has access to any published table via collection permissions."
  :feature :library
  []
  (data-studio.db/any-published-table-visible?))

(defenterprise user-has-published-table-permission-for-database?
  "Returns true if user has access to any published table in the given database via collection permissions."
  :feature :library
  [database-id]
  (data-studio.db/published-table-visible-in-database? database-id))

(defenterprise can-access-via-collection?
  "Returns true if the user can access this published table via collection read permissions."
  :feature :library
  [table]
  (when (:is_published table)
    (perms/collection-permission-at-least?
     (get (perms/collection-permissions-for-user (perms/user-info api/*current-user-id*)
                                                 [(:collection_id table)]
                                                 {:root-namespace nil})
          (:collection_id table))
     :read)))

(defenterprise published-table-perm-grant-rows
  "Returns a HoneySQL SELECT producing (id, perm_type, perm_value) rows for tables that are
  published into a collection the user can read. The grant supplies `:perms/create-queries
  :query-builder`; `:perms/view-data` is intentionally not synthesized — view-data must come from
  real `data_permissions` entries.

  Returns nil when the caller's permission mapping does not include `:perms/create-queries`. The Table has an alias of
  its own, `published_table`: H2 resolves a qualified column in a subquery against the same alias of an earlier branch
  of the union this select goes into."
  :feature :library
  [{:keys [user-id is-superuser? is-data-analyst?]} perm-types active-only?]
  (when (contains? (set perm-types) :perms/create-queries)
    ^:allow-subquery
    {:select [[:published_table.id :id]
              [(h2x/literal :perms/create-queries) :perm_type]
              [(h2x/literal :query-builder) :perm_value]]
     :from   [[(t2/table-name :model/Table) :published_table]]
     :where  (cond-> [:and
                      [:= :published_table.is_published true]
                      (perms/visible-collections-filter-clause
                       :published_table.collection_id
                       {:user-id user-id, :is-superuser? is-superuser?, :is-data-analyst? (boolean is-data-analyst?)}
                       {:root-namespace nil})]
               active-only? (conj [:= :published_table.active true]))}))
