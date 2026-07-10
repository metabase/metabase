(ns metabase.search.settings
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting search-typeahead-enabled
  (i18n/deferred-tru "Enable typeahead search in the {0} navbar?"
                     (setting/application-name-for-setting-descriptions appearance/application-name))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

(defn configured-search-engine
  "The operator's engine override, or nil when unset.
  [[search-engine]] resolves a default when unset; use this to see what was explicitly configured."
  []
  (setting/get-value-of-type :keyword :search-engine))

(defsetting search-engine
  (i18n/deferred-tru "The engine that serves search. Supported values are :in-place, :appdb, and :semantic. When unset, the best supported engine is used.")
  :visibility :authenticated
  :export?    false
  :setter     :none
  ;; Reading resolves the engine that actually serves search; [[configured-search-engine]] is the raw override.
  :getter     (fn []
                (some-> ((requiring-resolve 'metabase.search.engine/default-engine)) name keyword))
  :type       :keyword)

(defsetting additional-search-engines
  (i18n/deferred-tru "Engines to keep active (indexed and queryable per-request) in addition to the default engine.")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    nil
  :type       :csv
  ;; A newly activated engine needs its index initialized before it can serve, so setting this triggers the
  ;; search init task. The task is only registered when the scheduler runs (i.e. not in tests); engines
  ;; configured via env var are covered by the startup init.
  :setter     (fn [new-value]
                (let [result       (setting/set-value-of-type! :csv :additional-search-engines new-value)
                      job-exists?  (requiring-resolve 'metabase.task.core/job-exists?)
                      trigger-now! (requiring-resolve 'metabase.task.core/trigger-now!)
                      init-job-key @(requiring-resolve 'metabase.search.task.search-index/init-job-key)]
                  (when (job-exists? init-job-key)
                    (trigger-now! init-job-key))
                  result))
  :doc        false)

(defsetting experimental-search-weight-overrides
  (i18n/deferred-tru "Used to override weights used for search ranking")
  :visibility :internal
  :encryption :no
  :export?    false
  :default    nil
  :type       :json
  :doc        false)

(defsetting search-language
  (i18n/deferred-tru "When using the appdb engine against postgresql, override the language used for stemming in to_tsvector.
  Value must be a valid configured language option in your database such as ''english'' or ''simple''")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    nil
  :type       :string)
