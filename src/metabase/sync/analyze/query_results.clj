(ns metabase.sync.analyze.query-results
  "Analysis similar to what we do as part of the Sync process, but aimed at analyzing and introspecting query
  results. The current focus of this namespace is around column metadata from the results of a query. Going forward
  this is likely to extend beyond just metadata about columns but also about the query results as a whole and over
  time."
  (:require [metabase.models.humanization :as humanization]
            [metabase.query-processor.interface :as i]
            [metabase.sync.analyze.classifiers.name :as classify-name]
            [metabase.sync.analyze.fingerprint :as f]
            [metabase.sync.interface :as si]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  (s/constrained su/KeywordOrString
                 (fn [unit]
                   (contains? i/datetime-field-units (keyword unit)))
                 "Valid field datetime unit keyword or string"))

(def ^:private ResultColumnMetadata
  "Result metadata for a single column"
  {:name                          su/NonBlankString
   :display_name                  su/NonBlankString
   (s/optional-key :description)  (s/maybe su/NonBlankString)
   :base_type                     su/FieldTypeKeywordOrString
   (s/optional-key :special_type) (s/maybe su/FieldTypeKeywordOrString)
   (s/optional-key :unit)         (s/maybe DateTimeUnitKeywordOrString)
   (s/optional-key :fingerprint)  (s/maybe si/Fingerprint)})

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
                                          ;; If the original special type is a PK or FK, we don't want to use a new
                                          ;; computed special type because it'll just be confusing as we can't do any
                                          ;; meaningful binning etc on it. If it's not of that type and we are able to
                                          ;; compute a special type based on the results, use that
                                          (if-let [new-special-type (and (not (isa? original-value :type/PK))
                                                                         (not (isa? original-value :type/FK))
                                                                         (classify-name/infer-special-type col))]
                                            new-special-type
                                            original-value))))

(s/defn ^:private maybe-compute-fingerprint :- ResultColumnMetadata
  "If we already have a fingerprint from our stored metadata, use that. Queries that we don't have fingerprint data
  on, such as native queries, we'll need to run the fingerprint code similar to what sync does."
  [result-metadata col results-for-column]
  (if-let [values (and (not (contains? result-metadata :fingerprint))
                       (seq (remove nil? results-for-column)))]
    (assoc result-metadata :fingerprint (f/fingerprint col values))
    result-metadata))

(s/defn ^:private stored-column-metadata->result-column-metadata :- ResultColumnMetadata
  "The metadata in the column of our resultsets come from the metadata we store in the `Field` associated with the
  column. It is cheapest and easiest to just use that. This function takes what it can from the column metadata to
  populate the ResultColumnMetadata"
  [column]
  (merge
   ;; if base-type isn't set put a default one in there. Similarly just use humanized value of `:name` for `:display_name` if one isn't set
   {:base_type    :type/*
    :display_name (humanization/name->human-readable-name (name (:name column)))}
   (u/select-non-nil-keys column [:name :display_name :description :base_type :special_type :unit :fingerprint])
   ;; since years are actually returned as text they can't be used for breakout purposes so don't advertise them as DateTime columns
   (when (= (:unit column) :year)
     {:base_type :type/Text
      :unit      nil})))

(s/defn results->column-metadata :- ResultsMetadata
  "Return the desired storage format for the column metadata coming back from RESULTS, or `nil` if no columns were returned."
  [results]
  ;; rarely certain queries will return columns with no names, for example `SELECT COUNT(*)` in SQL Server seems to come back with no name
  ;; since we can't use those as field literals in subsequent queries just filter them out
  (for [[index col] (map-indexed vector (:cols results))
        :when       (seq (:name col))
        ;; TODO: This is really inefficient. This will make one pass over the data for each column returned, which
        ;; could be bad. The fingerprinting code expects to have a list of values to fingerprint, rather than more of
        ;; an accumulator style that will take one value at a time as we make a single pass over the data. Once we can
        ;; get the fingerprint code changed to support this, we should apply that change here
        :let        [results-for-column (map #(nth % index) (:rows results))]]
    (-> (stored-column-metadata->result-column-metadata col)
        (maybe-infer-special-type col)
        (maybe-compute-fingerprint col results-for-column))))
