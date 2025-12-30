(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- throw-block-permissions-exception
  []
  (throw (ex-info (tru "You do not have permissions to run this query.")
                  {:type               qp.error-type/missing-required-permissions
                   :actual-permissions @api/*current-user-permissions-set*
                   :permissions-error? true})))

(defn- all-non-sandboxed-tables-unrestricted?
  "For native query access: returns true if all tables in the database that are NOT sandboxed
   for this user have :unrestricted or :restricted-access view-data permission.

   This is used to allow sandboxed users to view native queries when:
   - They have sandboxes on some tables (which have :restricted-access permission)
   - All other tables have :unrestricted or :restricted-access permission

   If any non-sandboxed table is :blocked, the user cannot view native queries."
  [database-id]
  (let [all-table-ids (t2/select-pks-set :model/Table :db_id database-id :active true)
        sandboxed-table-ids (->> (perms/sandboxes-for-user)
                                 (filter #(= (get-in % [:table :db_id]) database-id))
                                 (map :table_id)
                                 set)
        non-sandboxed-table-ids (set/difference all-table-ids sandboxed-table-ids)]
    (every? #(contains? #{:unrestricted :restricted-access}
                        (perms/table-permission-for-user api/*current-user-id*
                                                         :perms/view-data
                                                         database-id
                                                         %))
            non-sandboxed-table-ids)))

(defenterprise check-block-permissions
  "Assert that block permissions are not in effect for Database or Tables for a query that's otherwise allowed to run
  because of Collection perms; throw an Exception if they are; otherwise return `true`. The query is still allowed to
  run if the current User has unrestricted data permissions from another Group. See the namespace documentation for
  [[metabase.collections.models.collection]] for more details."
  ;; if a token check fails we don't want to fail open here
  ;;
  ;; run this even when the feature is not enabled - throwing here is better than silently ignoring the configured
  ;; block.
  :feature :none
  [{database-id :database :as query}]
  (let [{:keys [table-ids sandboxed-table-ids impersonated? native?]}
        (query-perms/query->source-ids query)
        other-table-permissions   (into #{}
                                        (map (fn [table-id]
                                               (perms/table-permission-for-user api/*current-user-id*
                                                                                :perms/view-data
                                                                                database-id
                                                                                table-id))
                                             table-ids))]
    ;; Make sure we don't have block permissions for the entire DB or individual tables referenced by the query.
    (or
     impersonated?
     (not= :blocked (perms/full-db-permission-for-user api/*current-user-id* :perms/view-data database-id))
     ;; Allow if all tables have :unrestricted or :restricted-access permission (not :blocked or :legacy-no-self-service)
     (and (seq other-table-permissions) (every? #{:unrestricted :restricted-access} other-table-permissions))
     ;; Sandboxed users can view native queries as long as they're not blocked on any table. (Sandboxed tables don't count here.)
     (and native? (all-non-sandboxed-tables-unrestricted? database-id))
     (throw-block-permissions-exception))

    true))
