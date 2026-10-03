(ns metabase-enterprise.data-sensitivity.settings
  "Settings for the data-sensitivity module."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def ^:private default-max-concurrent-llm-calls 8)

(defsetting data-sensitivity-max-concurrent-llm-calls
  (deferred-tru "Maximum number of data-sensitivity classification LLM calls in flight across the instance. Lower it if the AI provider rate-limits classification runs.")
  :type       :positive-integer
  :default    default-max-concurrent-llm-calls
  :visibility :admin
  :encryption :no
  :export?    false
  :getter     (fn []
                (let [value (setting/get-value-of-type :positive-integer :data-sensitivity-max-concurrent-llm-calls)]
                  (if (pos-int? value)
                    value
                    default-max-concurrent-llm-calls))))
