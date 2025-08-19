(ns metabase.actions.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable Actions for a specific Database.")
  :default          false
  :driver-feature   :actions
  :type             :boolean
  :visibility       :public
  :database-local   :only)

;; reasons for disabling table editing

(def ^:private db-routing-reason
  {:key :setting/database-routing
   :message "Table editing is not supported with database routing."})

(def ^:private no-writable-tables-reason
  {:key :permissions/no-writable-table
   :message "Table editing requires at least one table with INSERT, UPDATE, and DELETE support."})

(def ^:private busy-sync-reason
  {:key :warning/database-sync-in-progress
   :message "Unable to determine whether the database connection is readonly, as it is still syncing."})

(def ^:private missing-permissions-reason
  {:key :warning/database-metadata-missing
   :message "Unable to determine whether the database connection is readonly, as we are missing metadata from sync."})

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether to enable table data editing for a specific Database.")
  :default          false
  :feature          :table-data-editing
  :driver-feature   :actions/data-editing
  :enabled-for-db? (fn [db]
                     (setting/custom-disabled-reasons!
                      [(when (database/is-destination? db) db-routing-reason)
                       (cond
                         ;; TODO we also care about re-sync after connection details are changed
                         (= (:initial_sync_status db) "incomplete") busy-sync-reason
                         (t2/exists? :model/Table :db_id (:id db) #_#_:is_writable true) nil
                         (t2/exists? :model/Table :db_id (:id db) #_#_:is_writable nil) missing-permissions-reason
                         :else no-writable-tables-reason)]))
  :type             :boolean
  :visibility       :public
  :database-local   :only
  :export?          true)
