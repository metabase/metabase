(ns metabase-enterprise.audit-app.permissions
  (:require
   [metabase.audit-app.core :as audit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def audit-db-view-names
  "Used for giving granular permissions into the audit db. Instead of granting permissions to
   all of the audit db, we query the audit db using the names of each view that starts with v_."
  #{"v_audit_log"
    "v_content"
    "v_dashboardcard"
    "v_group_members"
    "v_subscriptions"
    "v_users"
    "v_alerts"
    "v_databases"
    "v_fields"
    "v_query_log"
    "v_tables"
    "v_tasks"
    "v_task_runs"
    "v_view_log"})

(defenterprise check-audit-db-permissions
  "Performs a number of permission checks to ensure that a query on the Audit database can be run.
   Causes for rejection are:
      - if the current user does not have access to the analytics collection
      - native queries
      - queries that include tables that are not audit views"
  :feature :audit-app
  [{query-type :type, database-id :database, query :query :as outer-query}]
  ;; Check if the user has access to the analytics collection, since this should be coupled with access to the
  ;; audit database in general.
  (when-not (mi/can-read? (audit/default-audit-collection))
    (throw (ex-info (tru "You do not have access to the audit database") outer-query)))
  ;; query->source-table-ids returns a set of table IDs or a map with the key `:native?`
  (when (= query-type :native)
    (throw (ex-info (tru "Native queries are not allowed on the audit database")
                    outer-query)))
  (let [{:keys [table-ids native?]} (query-perms/query->source-ids query)]
    (when native?
      (throw (ex-info (tru "Native queries are not allowed on the audit database")
                      outer-query)))
    (qp.store/with-metadata-provider database-id
      (doseq [table-id table-ids]
        (when-not (audit-db-view-names
                   (u/lower-case-en (:name (lib.metadata/table (qp.store/metadata-provider) table-id))))
          (throw (ex-info (tru "Audit queries are only allowed on audit views")
                          outer-query)))))))

(defenterprise update-audit-collection-permissions!
  "Will remove or grant audit db (AppDB) permissions, if the instance analytics collection permissions changes. This
  technically isn't necessary, because we block all audit DB queries if a user doesn't have collection permissions.
  But it's cleaner to keep the audit DB permission paths in the database consistent."
  :feature :audit-app
  [group-id changes]
  (let [[change-id tyype] (first (filter #(= (first %) (:id (audit/default-audit-collection))) changes))]
    (when change-id
      (let [create-queries-value (case tyype
                                   :read  :query-builder
                                   :none  :no
                                   :write (throw (ex-info (tru "Unable to make audit collections writable.")
                                                          {:status-code 400})))
            view-tables         (t2/select :model/Table :db_id audit/audit-db-id :name [:in audit-db-view-names])]
        (doseq [table view-tables]
          (perms/set-table-permission! group-id table :perms/create-queries create-queries-value))))))
