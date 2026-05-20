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

;; Only governs the SQL lane. Python transforms always run one-at-a-time within a job because the
;; python-runner service is single-threaded; dispatching them in parallel would just queue them
;; against their own per-call timeouts.
(setting/defsetting transform-run-job-sql-concurrency
  (deferred-tru "Maximum number of SQL-backed transforms a single transform-job run may execute in parallel.")
  :type       :integer
  :visibility :internal
  :default    3
  :feature    :transforms-basic
  :doc        "This setting is only configurable on instances with the transforms add-on; OSS
  deployments without the add-on always use the default."
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
