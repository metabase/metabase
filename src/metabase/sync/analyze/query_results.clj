(ns metabase.sync.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.predicates :as mbql.preds]
            [metabase.sync.analyze.classifiers.name :as classify-name]
            [metabase.sync.analyze.fingerprint
             [fingerprinters :as f]
             [insights :as insights]]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [redux.core :as redux]
            [schema.core :as s]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  (s/constrained su/KeywordOrString
                 #(mbql.preds/DatetimeFieldUnit? (keyword %))
                 "Valid field datetime unit keyword or string"))

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  {:name                          s/Str
   :display_name                  s/Str
   (s/optional-key :description)  (s/maybe su/NonBlankString)
   :base_type                     su/FieldTypeKeywordOrString
   (s/optional-key :special_type) (s/maybe su/FieldTypeKeywordOrString)
   (s/optional-key :unit)         (s/maybe DateTimeUnitKeywordOrString)
   (s/optional-key :fingerprint)  (s/maybe i/Fingerprint)})

(def ResultsMetadata
  "Schema for valid values of the `result_metadata` column."
  (su/with-api-error-message (s/named [ResultColumnMetadata]
                                      "Valid array of results column metadata maps")
    "value must be an array of valid results column metadata maps."))

(s/defn ^:private maybe-infer-special-type :- ResultColumnMetadata
  "Infer the special type and add it to the result metadata. If the inferred special type is nil, don't override the
  special type with a nil special type"
  [col]
  (update
   col
   :special_type
   (fn [original-value]
     ;; If we already know the special type, becouse it is stored, don't classify again, but try to refine special
     ;; type set upstream for aggregation cols (which come back as :type/Number).
     (case original-value
       (nil :type/Number) (classify-name/infer-special-type col)
       original-value))))

(s/defn ^:private col->ResultColumnMetadata :- ResultColumnMetadata
  "Make sure a `column` as it comes back from a driver's initial results metadata matches the schema for valid results
  column metadata, adding placeholder values and removing nil keys."
  [column]
  ;; HACK - not sure why we don't have display_name yet in some cases
  (merge
   {:base_type    :type/*
    :display_name (:name column)}
   (u/select-non-nil-keys column [:name :display_name :description :base_type :special_type :unit :fingerprint])))

(defn insights-rf
  "A reducing function that calculates what is ultimately returned as `[:data :results_metadata]` in userland QP
  results. `metadata` is the usual QP results metadata e.g. as recieved by an `rff`."
  {:arglists '([metadata])}
  [{:keys [cols]}]
  (let [cols (for [col cols]
               (try
                 (maybe-infer-special-type (col->ResultColumnMetadata col))
                 (catch Throwable e
                   (log/error e (trs "Error generating insights for column:") col)
                   col)))]
    (redux/post-complete
     (redux/juxt
      (apply f/col-wise (for [{:keys [fingerprint], :as metadata} cols]
                          (if-not fingerprint
                            (f/fingerprinter metadata)
                            (f/constant-fingerprinter fingerprint))))
      (insights/insights cols))
     (fn [[fingerprints insights]]
       {:metadata (map (fn [fingerprint metadata]
                         (if (instance? Throwable fingerprint)
                           metadata
                           (assoc metadata :fingerprint fingerprint)))
                       fingerprints
                       cols)
        :insights (when-not (instance? Throwable insights)
                    insights)}))))
