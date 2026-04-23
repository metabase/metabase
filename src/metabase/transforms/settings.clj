(ns metabase.transforms.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(setting/defsetting transform-timeout
  (deferred-tru "The timeout for a transform job, in minutes.")
  :type       :integer
  :visibility :internal
  :default    (* 4 60)
  :doc        "Each query executed by a transform is also subject to the MB_DB_QUERY_TIMEOUT_MINUTES timeout,
  so make sure that value isn't lower, or it will timeout your transform."
  :feature    :transforms-basic
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting transform-run-job-concurrency
  (deferred-tru "Maximum number of transforms a single transform-job run may execute in parallel.")
  :type       :integer
  :visibility :internal
  :default    10
  :feature    :transforms-basic
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting transforms-enabled
  (deferred-tru "Enable transforms for instances that have not explicitly purchased the transform add-on.")
  :type       :boolean
  :visibility :authenticated
  :default    false
  :export?    false
  :audit      :getter)
