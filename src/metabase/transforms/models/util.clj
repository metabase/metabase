(ns metabase.transforms.models.util
  (:require
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn timestamp-constraint
  "Build a HoneySQL `[:and ...]` clause constraining `field-name` to the range expressed by `date-string`.
  `date-string` uses the same format as the query-processor date parameter (e.g. \"2025-01\", \"past7days\")."
  [field-name date-string]
  (let [{:keys [start end]}
        (try
          (params.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))
        start (some-> start u.date/parse)
        end   (some-> end   u.date/parse)]
    (into [:and] (remove nil?)
          [(when start [:>= field-name start])
           (when end   [:<  field-name end])])))
