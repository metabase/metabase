(ns metabase-enterprise.audit-app.permissions
  (:require
   [metabase-enterprise.audit-db :refer [default-audit-collection]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.permissions :as perms]
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
  "Checks that a given query is not a native query, and only includes table IDs corresponding to the audit views
  listed above. (These should be the only tables present in the DB anyway, but this is an extra check as a fallback measure)."
  :feature :audit-app
  [{query-type :type, database-id :database, query :query :as outer-query}]
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
  "Will remove or grant audit db (AppDB) permissions, if the instance analytics permissions changes."
  :feature :audit-app
  [group-id changes]
  (let [[change-id type] (first (filter #(= (first %) (:id (default-audit-collection))) changes))]
      (when change-id
        (let [change-permissions! (case type
                                    :read  perms/grant-permissions!
                                    :none  perms/delete-related-permissions!
                                    :write (throw (ex-info (tru (str "Unable to make audit collections writable."))
                                                           {:status-code 400})))
              view-tables         (t2/select :model/Table :db_id perms/audit-db-id :name [:in audit-db-view-names])]
          (doseq [table view-tables]
            (change-permissions! group-id (perms/table-query-path table)))))))
