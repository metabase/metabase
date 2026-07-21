(ns metabase.typed-schemas-rest.api.query-params
  "REST query parameter parsing for typed schemas."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- non-blank-string
  [value]
  (some-> value str str/trim not-empty))

(defn- reference
  [value name-key]
  (when-let [value (non-blank-string value)]
    (if-let [id (parse-long value)]
      {:id id}
      {name-key value})))

(defn- comma-separated-references
  [value]
  (if-let [value (non-blank-string value)]
    (->> (str/split value #",")
         (keep #(reference % :entity-id))
         vec)
    []))

(defn- enabled?
  [value]
  (contains? #{true "true" "1"} value))

(defn query-params->options
  "Converts REST query parameters into semantic schema options.

  This is the sole typed-schema function that accepts REST-shaped query
  parameters."
  [query-params]
  {:database                 (reference (:database query-params) :name)
   :library                  (reference (:library query-params) :name)
   :library-collection-refs  (comma-separated-references (or (:library-collections query-params)
                                                             (:collections query-params)))
   :question-collection-refs (comma-separated-references (:question-collections query-params))
   :include-data-library?    (enabled? (:include-data-library query-params))
   :include-metric-library?  (enabled? (:include-metric-library query-params))
   :include-models?          (enabled? (:include-models query-params))
   :questions-only?          (enabled? (:questions query-params))})
