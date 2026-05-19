(ns metabase.transforms.settings
  (:require
   [metabase.driver.settings :as driver.settings]
   [metabase.settings.core :as setting]
   [metabase.transforms.usage :as transforms.usage]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(setting/defsetting transform-timeout
  (deferred-tru "The timeout for a transform job, in minutes.")
  :type       :integer
  :visibility :internal
  :default    (* 4 60)
  :doc        "Controls the timeout for transform runs, including the queries they execute. This takes precedence
  over MB_DB_QUERY_TIMEOUT_MINUTES for queries executed inside a transform, so transforms can run longer than regular
  Metabase queries."
  :feature    :transforms-basic
  :export?    false
  :encryption :no
  :audit      :getter)

;; Keep the warehouse pool's unreturned-connection leak-detector above the transform timeout so that a long transform
;; doesn't get its JDBC connection killed out from under it.
(driver.settings/register-long-running-timeout-provider!
 ::transform-timeout
 (fn [] (* 60 (transform-timeout))))

(setting/defsetting transforms-enabled
  (deferred-tru "Enable transforms for instances that have not explicitly purchased the transform add-on.")
  :type       :boolean
  :visibility :authenticated
  :default    false
  :export?    false
  :audit      :getter)

(setting/defsetting transforms-meter-locked
  (deferred-tru "True when the customer''s active transforms meter is locked (trial quota exhausted).")
  :type       :boolean
  :visibility :authenticated
  :setter     :none
  :audit      :never
  :export?    false
  :default    false
  :doc        false
  :getter     transforms.usage/transforms-meter-locked?)
