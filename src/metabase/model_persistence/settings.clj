(ns metabase.model-persistence.settings
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting persisted-models-enabled
  (i18n/deferred-tru "Allow persisting models into the source database.")
  :type       :boolean
  :default    false
  :visibility :public
  :export?    true
  :audit      :getter)

(defsetting persisted-model-refresh-cron-schedule
  (i18n/deferred-tru "cron syntax string to schedule refreshing persisted models.")
  :encryption :no
  :type       :string
  :default    "0 0 0/6 * * ? *"
  :visibility :admin
  :audit      :getter)

(defsetting persist-models-enabled
  (i18n/deferred-tru "Whether to enable models persistence for a specific Database.")
  :default        false
  :type           :boolean
  :visibility     :public
  :database-local :only)
