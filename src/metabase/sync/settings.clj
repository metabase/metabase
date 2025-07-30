(ns metabase.sync.settings
  (:require
   [environ.core :as env]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(defn- -show-database-syncing-modal []
  (let [v (setting/get-value-of-type :boolean :show-database-syncing-modal)]
    (if (nil? v)
      (not (t2/exists? :model/Database
                       :is_sample false
                       :is_audit false
                       :initial_sync_status "complete"))
      ;; frontend should set this value to `true` after the modal has been shown once
      v)))

(defsetting show-database-syncing-modal
  (deferred-tru
   (str "Whether an introductory modal should be shown after the next database connection is added. "
        "Defaults to false if any non-default database has already finished syncing for this instance."))
  :visibility :admin
  :type       :boolean
  :audit      :never
  :getter     #'-show-database-syncing-modal)

(defsetting auto-cruft-columns
  "A list of pattern strings that get converted into additional regexes that match Fields that should automatically be
  marked as visibility-type = `:hidden`. Not to be set directly, this setting lives in the metabase_database.settings json blob."
  :type           :json
  :database-local :only
  :visibility     :internal
  :default        []
  :export?        true
  :encryption     :no)

(defsetting auto-cruft-tables
  "A list of pattern strings that get converted into additional regexes that match Tables that should automatically be
  marked as `:cruft`."
  :type           :json
  :database-local :only
  :visibility     :internal
  :export?        true
  :default        []
  :encryption     :no)

(defsetting reactivate-table-block-permissions
  (deferred-tru "Controls whether reactivated tables should have their permissions automatically set to blocked.
                 When the MB_REACTIVATE_MEMORY environment variable is set to 'false', any table that gets 
                 reactivated during sync (marked as active after being inactive) will have its view-data 
                 permissions set to blocked for all permission groups. This provides a security mechanism 
                 to prevent accidentally exposing data from tables that were previously hidden.
                 
                 Default behavior (when MB_REACTIVATE_MEMORY is not set to 'false'): reactivated tables 
                 retain their previous permissions.")
  :type       :boolean
  :default    true
  :setter     :none
  :visibility :internal
  :export?    false
  :getter     (fn reactivate-table-block-permissions-getter []
                ;; Only block permissions if MB_REACTIVATE_MEMORY is explicitly set to "false" (case-insensitive)
                ;; Any other value (including unset) preserves default behavior
                (not= "false" (u/lower-case-en (env/env :mb-reactivate-memory))))
  :audit      :getter)
