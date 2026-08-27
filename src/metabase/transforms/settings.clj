(ns metabase.transforms.settings
  (:require
   [metabase.premium-features.core :as premium-features]
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
  Metabase queries. Enforced per-statement via `Statement.setQueryTimeout`; transforms also use a separate JDBC
  connection pool whose c3p0 leak-detector tolerates this longer runtime, so non-transform connections continue to
  use the shorter `MB_DB_QUERY_TIMEOUT_MINUTES` leak-detector."
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

(defn- explicit-transforms-enabled
  "Returns the :transforms-enabled setting if explicitly set, otherwise nil."
  []
  (setting/get-value-of-type :boolean :transforms-enabled))

(defn- cloud-enabled-transforms?
  "Whether a cloud instance has enabled transforms.
   If a cloud instance has the transforms token feature, then they've gone through the upsell and enabled transforms.
   Self-hosted instances don't go through the upsell, so we require that they explicitly enable transforms via the setting."
  []
  (and (premium-features/is-hosted?)
       (premium-features/has-feature? :transforms-basic)))

(setting/defsetting transforms-enabled
  (deferred-tru "Whether transforms are enabled.")
  :doc "When enabled, data analysts and admins can write, schedule and run transforms.
  Disabling this feature will hide all transform features, prevent transform editing or creation, and prevent any new runs."
  :type       :boolean
  :visibility :authenticated
  :export?    true
  :audit      :getter
  :getter (fn []
            ;; if the setting is set (whether true or false), use it, otherwise use the token feature for cloud
            (if-some [v (explicit-transforms-enabled)]
              v
              (cloud-enabled-transforms?))))

(setting/defsetting transforms-setup-complete
  (deferred-tru "Whether transforms setup is complete.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :audit      :getter
  :can-read-from-env? false
  :getter (fn []
            ;; if the setting is set (whether true or false), then setup is complete. otherwise, check the token feature for cloud
            (or (some? (explicit-transforms-enabled))
                (cloud-enabled-transforms?))))

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
