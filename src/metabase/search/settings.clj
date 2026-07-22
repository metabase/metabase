(ns metabase.search.settings
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

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
  ;; Post-commit + future: the trigger check must observe the final committed settings state (a surrounding
  ;; set-many! may include the setting that makes the engine supported) and stay off the transaction's thread.
  :setter     (fn [new-value]
                (let [before (set ((requiring-resolve 'metabase.search.engine/active-engines)))
                      result (setting/set-value-of-type! :csv :additional-search-engines new-value)]
                  (mdb/do-after-commit
                   #(future
                      (try
                        ((requiring-resolve 'metabase.search.task.search-index/trigger-init-for-newly-active-engines!)
                         before)
                        (catch Throwable t
                          (log/error t "Failed to trigger search index init for newly active engines")))))
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
