(ns metabase-enterprise.data-studio.permissions.published-tables
  "Enterprise implementation of published table permissions.
  Provides query access to published tables via collection permissions."
  (:require
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

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
    (let [collection-id (:collection_id table)]
      (perms/collection-permission-at-least?
       (get (perms/collection-permissions-for-user (api/current-user-info) [collection-id] {:root-namespace nil})
            collection-id)
       :read))))

(defenterprise published-table-clause
  "A HoneySQL clause holding when the Table aliased `table-alias` is published into a Collection the user of
  `user-info` can read, which grants `:perms/create-queries :query-builder`. It reads the probed Table's own columns,
  so each Table is checked on its own."
  :feature :library
  [{:keys [user-id is-superuser? is-data-analyst?]} table-alias]
  (let [column (fn [c] (keyword (str (name table-alias) "." c)))]
    [:and
     [:= (column "is_published") true]
     (perms/visible-collections-filter-clause
      (column "collection_id")
      {:user-id user-id, :is-superuser? (boolean is-superuser?), :is-data-analyst? (boolean is-data-analyst?)}
      {:root-namespace nil})]))
