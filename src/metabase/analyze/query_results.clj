(ns metabase.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require
   [metabase.analyze.classifiers.name :as classifiers.name]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.analyze.fingerprint.insights :as insights]
   [metabase.query-processor.schema :as query-processor.schema]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [redux.core :as redux]))

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  [:ref ::query-processor.schema/result-metadata.column])

(mr/def ::ResultsMetadata
  (mu/with-api-error-message
   [:maybe [:sequential ResultColumnMetadata]]
   (i18n/deferred-tru "value must be an array of valid results column metadata maps.")))

(def ResultsMetadata
  "Schema for valid values of the `result_metadata` column."
  [:ref ::ResultsMetadata])

(mu/defn- maybe-infer-semantic-type :- ResultColumnMetadata
  "Infer the semantic type and add it to the result metadata. If the inferred semantic type is nil, don't override the
  semantic type with a nil semantic type"
  [col]
  (update
   col
   :semantic_type
   (fn [original-value]
     ;; If we already know the semantic type, because it is stored, don't classify again, but try to refine semantic
     ;; type set upstream for aggregation cols (which come back as :type/Number).
     (case original-value
       (nil :type/Number) (classifiers.name/infer-semantic-type-by-name col)
       original-value))))

(mu/defn- col->ResultColumnMetadata :- ResultColumnMetadata
  "Make sure a `column` as it comes back from a driver's initial results metadata matches the schema for valid results
  column metadata, adding placeholder values and removing nil keys."
  [column]
  ;; HACK - not sure why we don't have display_name yet in some cases
  (merge
   {:base_type    :type/*
    :display_name (:name column)}
   column))

(mu/defn insights-rf :- fn?
  "A reducing function that calculates what is ultimately returned as `[:data :results_metadata]` in userland QP
  results. `metadata` is the usual QP results metadata e.g. as received by an `rff`."
  {:arglists '([metadata])}
  [{:keys [cols]}]
  (let [cols (for [col cols]
               (try
                 (maybe-infer-semantic-type (col->ResultColumnMetadata col))
                 (catch Throwable e
                   (log/errorf e "Error generating insights for column: %s" col)
                   col)))]
    (redux/post-complete
     (redux/juxt
      (apply fingerprinters/col-wise (for [{:keys [fingerprint], :as metadata} cols]
                                       (if-not fingerprint
                                         (fingerprinters/fingerprinter metadata)
                                         (fingerprinters/constant-fingerprinter fingerprint))))
      (insights/insights cols))
     (fn [[fingerprints insights]]
       {:metadata (mapv (fn [fingerprint metadata]
                          (if (instance? Throwable fingerprint)
                            metadata
                            (assoc metadata :fingerprint fingerprint)))
                        fingerprints
                        cols)
        :insights (when-not (instance? Throwable insights)
                    insights)}))))
