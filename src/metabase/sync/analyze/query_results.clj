(ns metabase.sync.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.predicates :as mbql.preds]
            [metabase.mbql.schema :as mbql.s]
            [metabase.sync.analyze.classifiers.name :as classify-name]
            [metabase.sync.analyze.fingerprint.fingerprinters :as f]
            [metabase.sync.analyze.fingerprint.insights :as insights]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.schema :as su]
            [redux.core :as redux]
            [schema.core :as s]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  (s/constrained su/KeywordOrString
                 #(mbql.preds/DateTimeUnit? (keyword %))
                 "Valid field datetime unit keyword or string"))

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  ;; this schema is used for both the API and the QP, so it should handle either normalized or unnormalized values. In
  ;; the QP, everything will be normalized.
  {:name                           s/Str
   :display_name                   s/Str
   (s/optional-key :description)   (s/maybe su/NonBlankString)
   :base_type                      su/FieldTypeKeywordOrString
   (s/optional-key :semantic_type) (s/maybe su/FieldSemanticOrRelationTypeKeywordOrString)
   (s/optional-key :unit)          (s/maybe DateTimeUnitKeywordOrString)
   (s/optional-key :fingerprint)   (s/maybe i/Fingerprint)
   (s/optional-key :id)            (s/maybe su/IntGreaterThanZero)
   ;; only optional because it's not present right away, but it should be present at the end.
   (s/optional-key :field_ref)     (s/cond-pre
                                    mbql.s/FieldOrAggregationReference
                                    (s/pred
                                     (comp (complement (s/checker mbql.s/FieldOrAggregationReference))
                                           mbql.normalize/normalize-tokens )
                                     "Field or aggregation reference as it comes in to the API"))
   s/Keyword                       s/Any})

(def ResultsMetadata
  "Schema for valid values of the `result_metadata` column."
  (su/with-api-error-message (s/named [ResultColumnMetadata]
                                      "Valid array of results column metadata maps")
    "value must be an array of valid results column metadata maps."))

(s/defn ^:private maybe-infer-semantic-type :- ResultColumnMetadata
  "Infer the semantic type and add it to the result metadata. If the inferred semantic type is nil, don't override the
  semantic type with a nil semantic type"
  [col]
  (update
   col
   :semantic_type
   (fn [original-value]
     ;; If we already know the semantic type, becouse it is stored, don't classify again, but try to refine semantic
     ;; type set upstream for aggregation cols (which come back as :type/Number).
     (case original-value
       (nil :type/Number) (classify-name/infer-semantic-type col)
       original-value))))

(s/defn ^:private col->ResultColumnMetadata :- ResultColumnMetadata
  "Make sure a `column` as it comes back from a driver's initial results metadata matches the schema for valid results
  column metadata, adding placeholder values and removing nil keys."
  [column]
  ;; HACK - not sure why we don't have display_name yet in some cases
  (merge
   {:base_type    :type/*
    :display_name (:name column)}
   (u/select-non-nil-keys
    column
    [:name :display_name :description :base_type :semantic_type :unit :fingerprint :id :field_ref])))

(defn insights-rf
  "A reducing function that calculates what is ultimately returned as `[:data :results_metadata]` in userland QP
  results. `metadata` is the usual QP results metadata e.g. as received by an `rff`."
  {:arglists '([metadata])}
  [{:keys [cols]}]
  (let [cols (for [col cols]
               (try
                 (maybe-infer-semantic-type (col->ResultColumnMetadata col))
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
