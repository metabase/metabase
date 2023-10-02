(ns metabase-enterprise.audit-app.permissions
  (:require
   [metabase-enterprise.audit-db :refer [default-audit-collection-id
                                         default-audit-db-id]]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.shared.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def audit-db-view-names
  "Used for giving granular permissions into the audit db. Instead of granting permissions to
   all of the audit db, we query the audit db using the names of each view that starts with v_."
  ["v_users" "v_content" "v_group_members" "v_alerts_subscriptions" "v_activity"])

(defenterprise update-audit-collection-permissions!
  "Will remove or grant audit db (AppDB) permissions, if the instance analytics permissions changes."
  :feature :audit-app
  [group-id changes]
    (let [audit-collection-id (default-audit-collection-id)
          [change-id type]    (first (filter #(= (first %) audit-collection-id) changes))]
        (when change-id
          (let [change-permissions! (case type
                                      :read  perms/grant-permissions!
                                      :none  perms/delete-related-permissions!
                                      :write (throw (ex-info (tru (str "Unable to make audit collections writable."))
                                                             {:status-code 400})))
                view-tables         (t2/select :model/Table :db_id (default-audit-db-id) :name [:in audit-db-view-names])]
            (doseq [table view-tables]
              (change-permissions! group-id (perms/table-query-path table)))))))
