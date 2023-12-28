(ns metabase.sync.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require
   [metabase.lib.schema.expression.temporal
    :as lib.schema.expression.temporal]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.predicates :as mbql.preds]
   [metabase.mbql.schema :as mbql.s]
   [metabase.sync.analyze.classifiers.name :as classifiers.name]
   [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.sync.analyze.fingerprint.insights :as insights]
   [metabase.sync.interface :as i]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [redux.core :as redux]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  [:and
   ms/KeywordOrString
   [:fn
    {:error/message "Valid field datetime unit keyword or string"}
    #(mbql.preds/DateTimeUnit? (keyword %))]])

(mr/def ::MaybeUnnormalizedReference
  [:fn
   {:error/message "Field or aggregation reference as it comes in to the API"}
   (fn [x]
     (mr/validate mbql.s/Reference (mbql.normalize/normalize-tokens x)))])

(mr/def ::ResultColumnMetadata
  [:map
   [:name         :string]
   [:display_name :string]
   [:base_type    ms/FieldTypeKeywordOrString]
   [:description        {:optional true} [:maybe :string]]
   [:semantic_type      {:optional true} [:maybe ms/FieldSemanticOrRelationTypeKeywordOrString]]
   [:unit               {:optional true} [:maybe DateTimeUnitKeywordOrString]]
   [:fingerprint        {:optional true} [:maybe i/Fingerprint]]
   [:id                 {:optional true} [:maybe ::lib.schema.id/field]]
   ;; only optional because it's not present right away, but it should be present at the end.
   [:field_ref          {:optional true} [:ref ::MaybeUnnormalizedReference]]
   ;; the timezone in which the column was converted to using `:convert-timezone` expression
   [:converted_timezone {:optional true} ::lib.schema.expression.temporal/timezone-id]])

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  ;; this schema is used for both the API and the QP, so it should handle either normalized or unnormalized values. In
  ;; the QP, everything will be normalized.
  [:ref ::ResultColumnMetadata])

(mr/def ::ResultsMetadata
  (mu/with-api-error-message
   [:maybe [:sequential ResultColumnMetadata]]
   (i18n/deferred-tru "value must be an array of valid results column metadata maps.")))

(def ResultsMetadata
  "Schema for valid values of the `result_metadata` column."
  [:ref ::ResultsMetadata])

(mu/defn ^:private maybe-infer-semantic-type :- ResultColumnMetadata
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
       (nil :type/Number) (classifiers.name/infer-semantic-type col)
       original-value))))

(mu/defn ^:private col->ResultColumnMetadata :- ResultColumnMetadata
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
       {:metadata (map (fn [fingerprint metadata]
                         (if (instance? Throwable fingerprint)
                           metadata
                           (assoc metadata :fingerprint fingerprint)))
                       fingerprints
                       cols)
        :insights (when-not (instance? Throwable insights)
                    insights)}))))
