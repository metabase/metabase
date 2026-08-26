(ns metabase.sync.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
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

(defsetting scan-max-fields-per-table
  "Maximum number of fields per table to scan for field values. If a table has more active fields than this, the rest
  are skipped when scanning field values -- scanning that many fields would load them all into memory and, on non-SQL
  drivers like MongoDB, issue a warehouse request per field."
  :visibility :internal
  :export?    true
  :type       :integer
  :default    10000)

(defsetting fingerprint-max-fields-per-table
  "Maximum number of fields per table to fingerprint. If a table has more eligible fields than this, the rest are
  skipped during fingerprinting analysis -- loading that many fields into memory at once can exhaust the heap (this has
  OOM'd instances syncing document databases like MongoDB with very large or dynamic schemas)."
  :visibility :internal
  :export?    true
  :type       :integer
  :default    10000)
