(ns metabase.sync.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require [metabase.mbql.predicates :as mbql.preds]
            [metabase.sync.analyze.classifiers.name :as classify-name]
            [metabase.sync.analyze.fingerprint
             [fingerprinters :as f]
             [insights :as insights]]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [redux.core :as redux]
            [schema.core :as s]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  (s/constrained su/KeywordOrString
                 #(mbql.preds/DatetimeFieldUnit? (keyword %))
                 "Valid field datetime unit keyword or string"))

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  {:name                          su/NonBlankString
   :display_name                  su/NonBlankString
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
  [result-metadata col]
  (update result-metadata :special_type (fn [original-value]
                                          ;; If we already know the special type, becouse it is stored, don't classify again,
                                          ;; but try to refine special type set upstream for aggregation cols (which come back as :type/Number).
                                          (case original-value
                                            (nil :type/Number) (classify-name/infer-special-type col)
                                            original-value))))

(s/defn ^:private stored-column-metadata->result-column-metadata :- ResultColumnMetadata
  "The metadata in the column of our resultsets come from the metadata we store in the `Field` associated with the
  column. It is cheapest and easiest to just use that. This function takes what it can from the column metadata to
  populate the ResultColumnMetadata"
  [column]
  (merge
   (u/select-non-nil-keys column [:name :display_name :description :base_type :special_type :unit :fingerprint])
   ;; since years are actually returned as text they can't be used for breakout purposes so don't advertise them as DateTime columns
   (when (= (:unit column) :year)
     {:base_type :type/Text
      :unit      nil})))

;; TODO schema
(defn results->column-metadata
  "Return the desired storage format for the column metadata coming back from RESULTS and fingerprint the RESULTS."
  [results]
  (let [result-metadata (for [col (:cols results)]
                          (-> col
                              stored-column-metadata->result-column-metadata
                              (maybe-infer-special-type col)))]
    (transduce identity
               (redux/post-complete
                (redux/juxt
                 (apply f/col-wise (for [metadata result-metadata]
                                     (if-not (:fingerprint metadata)
                                       (f/fingerprinter metadata)
                                       (f/constant-fingerprinter (:fingerprint metadata)))))
                 (insights/insights result-metadata))
                (fn [[fingerprints insights]]
                  {:metadata (map (fn [fingerprint metadata]
                                    (if (instance? Throwable fingerprint)
                                      metadata
                                      (assoc metadata :fingerprint fingerprint)))
                                  fingerprints
                                  result-metadata)
                   :insights insights}))
               (:rows results))))
