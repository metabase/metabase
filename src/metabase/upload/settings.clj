(ns metabase.upload.settings
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- not-handling-api-request?
  []
  (nil? @api/*current-user*))

(defsetting uploads-settings
  (deferred-tru "Upload settings")
  :encryption :when-encryption-key-set ; this doesn't really have an effect as this setting is not stored as a setting model
  :visibility :authenticated
  :export?    false ; the data is exported with a database export, so we don't need to export a setting
  :type       :json
  :audit      :getter
  :getter     (fn []
                (let [db (t2/select-one :model/Database :uploads_enabled true)]
                  {:db_id        (:id db)
                   :schema_name  (:uploads_schema_name db)
                   :table_prefix (:uploads_table_prefix db)}))
  :setter     (fn [{:keys [db_id schema_name table_prefix]}]
                (cond
                  (nil? db_id)
                  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled      false
                                                                     :uploads_schema_name  nil
                                                                     :uploads_table_prefix nil})
                  (or (not-handling-api-request?)
                      (mi/can-write? :model/Database db_id))
                  (t2/update! :model/Database db_id {:uploads_enabled      true
                                                     :uploads_schema_name  schema_name
                                                     :uploads_table_prefix table_prefix})
                  :else
                  (api/throw-403))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;; Deprecated uploads settings begin
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; These settings were removed in 50.0 and will be erased from the code in 53.0. They have been left here to explain how
;; to migrate to the new way to set uploads settings.

(defsetting uploads-enabled
  (deferred-tru "Whether or not uploads are enabled")
  :deprecated "0.50.0"
  :visibility :internal
  :export?    false
  :type       :boolean
  :default    false
  :getter     (fn [] (throw (Exception. "uploads-enabled has been removed; use 'uploads_enabled' on the database instead")))
  :setter     (fn [_] (log/warn "'uploads-enabled' has been removed; use 'uploads_enabled' on the database instead")))

(defsetting uploads-database-id
  (deferred-tru "Database ID for uploads")
  :deprecated "0.50.0"
  :visibility :internal
  :export?    false
  :type       :integer
  :getter     (fn [] (throw (Exception. "uploads-database-id has been removed; use 'uploads_enabled' on the database instead")))
  :setter     (fn [_] (log/warn "'uploads-database-id' has been removed; use 'uploads_enabled' on the database instead")))

(defsetting uploads-schema-name
  (deferred-tru "Schema name for uploads")
  :deprecated "0.50.0"
  :encryption :no
  :visibility :internal
  :export?    false
  :type       :string
  :getter     (fn [] (throw (Exception. "uploads-schema-name has been removed; use 'uploads_schema_name' on the database instead")))
  :setter     (fn [_] (log/warn "'uploads-schema-name' has been removed; use 'uploads_schema_name' on the database instead")))

(defsetting uploads-table-prefix
  (deferred-tru "Prefix for upload table names")
  :encryption :no
  :deprecated "0.50.0"
  :visibility :internal
  :export?    false
  :type       :string
  :getter     (fn [] (throw (Exception. "uploads-table-prefix has been removed; use 'uploads_table_prefix' on the database instead")))
  :setter     (fn [_] (log/warn "'uploads-table-prefix' has been removed; use 'uploads_table_prefix' on the database instead")))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;; Deprecated uploads settings end
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
