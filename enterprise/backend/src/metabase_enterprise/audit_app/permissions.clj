(ns metabase-enterprise.audit-app.permissions
  (:require
   [metabase.audit :as audit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.store :as qp.store]
   [metabase.shared.util.i18n :refer [tru]]
   [metabase.util :as u]
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
  ;; query->source-table-ids returns a set of table IDs and/or the ::query-perms/native keyword
  (when (= query-type :native)
    (throw (ex-info (tru "Native queries are not allowed on the audit database")
                    outer-query)))
  (let [table-ids-or-native-kw (query-perms/query->source-table-ids query)]
    (qp.store/with-metadata-provider database-id
      (doseq [table-id table-ids-or-native-kw]
        (when (= table-id ::query-perms/native)
          (throw (ex-info (tru "Native queries are not allowed on the audit database")
                          outer-query)))
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
                                     :write (throw (ex-info (tru (str "Unable to make audit collections writable."))
                                                            {:status-code 400})))
              view-tables         (t2/select :model/Table :db_id audit/audit-db-id :name [:in audit-db-view-names])]
          (doseq [table view-tables]
            (data-perms/set-table-permission! group-id table :perms/create-queries create-queries-value))))))
