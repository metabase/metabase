(ns metabase.actions.settings
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.settings.core :as setting]
   [metabase.startup.core :as startup]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :as i18n]
   [metabase.warehouses.models.database :as database]))

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable Actions for a specific Database.")
  :default          false
  :driver-feature   :actions
  :type             :boolean
  :visibility       :public
  :database-local   :only)

;; reasons for disabling table editing

(def ^:private db-routing-reason
  {:key     :setting/database-routing
   :type    :error
   :message (i18n/deferred-tru "Table editing is not supported with database routing.")})

(def ^:private no-writable-tables-reason
  {:key     :permissions/no-writable-table
   :type    :error
   :message (i18n/deferred-tru "Table editing requires at least one table with INSERT, UPDATE, and DELETE support.")})

(def ^:private busy-sync-reason
  {:key     :database-metadata/sync-in-progress
   :type    :warning
   :message (i18n/deferred-tru "Unable to determine whether the database connection is readonly, as it is still syncing.")})

(def ^:private missing-permissions-reason
  {:key     :database-metadata/not-populated
   :type    :warning
   :message (i18n/deferred-tru "Unable to determine whether the database connection is readonly, as we are missing metadata from sync.")})

;; Marking reasons as warnings allow the user to proactively set the configuration, but it will only come into
;; effect once the warning is resolved.

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether the Database has table data editing enabled.")
  :default          false
  :feature          :table-data-editing
  :driver-feature   :actions/data-editing
  :enabled-for-db? (fn [db]
                     (setting/custom-disabled-reasons!
                      [(when (database/is-destination? db) db-routing-reason)
                       (when (actions.db/destination-database-exists-for-router? (:id db)) db-routing-reason)
                       (cond
                         ;; TODO we also care about re-sync after connection details are changed
                         (= (:initial_sync_status db) "incomplete") busy-sync-reason
                         ;; NOTE: we could optimize this into a single query, but the code would be less elegant.
                         (actions.db/writable-table-exists? (:id db)) nil
                         (actions.db/table-with-unknown-writability-exists? (:id db)) missing-permissions-reason
                         :else no-writable-tables-reason)]))
  :type             :boolean
  :visibility       :public
  :database-local   :only
  :export?          true)

(setting/defsetting http-action-allowed-networks
  (str "Controls which types of hosts HTTP actions may send requests to.\n"
       "Options:\n"
       "- external-only (default - only external hosts)\n"
       "- allow-private (external + private networks but NOT localhost)\n"
       "- allow-all (no restrictions including localhost).\n")
  :type       :keyword
  :visibility :internal
  :default    :external-only
  :export?    false
  :setter     :none
  :doc        (str "Set this when an HTTP action must reach a host on your private network "
                   "(`allow-private`) or on this machine (`allow-all`). Default is `external-only`")
  :getter     (fn []
                (let [[env-var-name raw-value] (setting/env-var-source :http-action-allowed-networks)]
                  (or (u.http/env-network-policy env-var-name raw-value)
                      :external-only))))

(defmethod startup/def-startup-validation! ::http-action-allowed-networks [_]
  (http-action-allowed-networks))
