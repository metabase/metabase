(ns metabase.change-log.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting change-log-enabled
  ;; no need to i18n -- this isn't user-facing
  "Whether Metabase logs the inserts, updates and deletes of the models that derive `:hook/change-log` in `change_log`.
  It logs them only while Metabase is hosted or its licence has `:audit-app`, the audit log's feature, which stands in
  until the change log has one of its own."
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :doc        false)

(defsetting change-log-active
  ;; no need to i18n -- this isn't user-facing
  "Whether Metabase logged its changes when a process last saw the change log turn on or off. A process that starts with
  the change log on compares with it, so turning the log on writes a start marker even when Metabase restarted while it
  was off."
  :type               :boolean
  :default            false
  :visibility         :internal
  :export?            false
  :can-read-from-env? false
  :doc                false
  :audit              :never)

(defsetting change-log-retention-days
  ;; no need to i18n -- this isn't user-facing
  "How many days Metabase keeps the entries of `change_log`."
  :type       :positive-integer
  :default    30
  :visibility :internal
  :export?    false
  :doc        false)
