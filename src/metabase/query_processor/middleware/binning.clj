(ns metabase.query-processor.middleware.binning
  "Middleware that handles `:binning` strategy in `:field` clauses. This adds extra info to the `:binning` options maps
  that contain the information Query Processors will need in order to perform binning."
  (:require
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private FieldID->Filters
  [:map-of [:ref ::lib.schema.id/field] [:sequential mbql.s/Filter]])

(mu/defn ^:private filter->field-map :- FieldID->Filters
  "Find any comparison or `:between` filter and return a map of referenced Field ID -> all the clauses the reference
  it."
  [filter-clause :- [:maybe mbql.s/Filter]]
  (reduce
   (partial merge-with concat)
   {}
   (for [subclause (mbql.u/match filter-clause #{:between :< :<= :> :>=})
         field-id  (mbql.u/match subclause [:field (field-id :guard integer?) _] field-id)]
     {field-id [subclause]})))

(mu/defn ^:private extract-bounds :- [:map [:min-value number?] [:max-value number?]]
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [field-id          :- [:maybe ::lib.schema.common/positive-int]
   fingerprint       :- [:maybe :map]
   field-id->filters :- FieldID->Filters]
  (let [{global-min :min, global-max :max} (get-in fingerprint [:type :type/Number])
        filter-clauses                     (get field-id->filters field-id)
        ;; [:between <field> <min> <max>] or [:< <field> <x>]
        user-maxes                         (mbql.u/match filter-clauses
                                             [(_ :guard #{:< :<= :between}) & args] (last args))
        user-mins                          (mbql.u/match filter-clauses
                                             [(_ :guard #{:> :>= :between}) _ min-val & _] min-val)
        min-value                          (or (when (seq user-mins)
                                                 (apply max user-mins))
                                               global-min)
        max-value                          (or (when (seq user-maxes)
                                                 (apply min user-maxes))
                                               global-max)]
    (when-not (and min-value max-value)
      (throw (ex-info (tru "Unable to bin Field without a min/max value")
               {:type        qp.error-type/invalid-query
                :field-id    field-id
                :fingerprint fingerprint})))
    {:min-value min-value, :max-value max-value}))

(def ^:private PossiblyLegacyColumnMetadata
  [:map
   [:name :string]])

(mu/defn ^:private matching-metadata-from-source-metadata :- ::lib.schema.metadata/column
  [field-name      :- ::lib.schema.common/non-blank-string
   source-metadata :- [:maybe [:sequential PossiblyLegacyColumnMetadata]]]
  (do
    ;; make sure source-metadata exists
    (when-not source-metadata
      (throw (ex-info (tru "Cannot update binned field: query is missing source-metadata")
                      {:field field-name})))
    ;; try to find field in source-metadata with matching name
    (let [mlv2-metadatas (for [col source-metadata]
                           (lib.card/->card-metadata-column (qp.store/metadata-provider) col))]
      (or
       (lib.equality/find-matching-column
        [:field {:lib/uuid (str (random-uuid)), :base-type :type/*} field-name]
        mlv2-metadatas)
       (throw (ex-info (tru "Cannot update binned field: could not find matching source metadata for Field {0}"
                            (pr-str field-name))
                       {:field field-name, :resolved-metadata mlv2-metadatas}))))))

(mu/defn ^:private matching-metadata :- ::lib.schema.metadata/column
  [field-id-or-name :- [:or ::lib.schema.id/field ::lib.schema.common/non-blank-string]
   source-metadata  :- [:maybe [:sequential PossiblyLegacyColumnMetadata]]]
  (if (integer? field-id-or-name)
    ;; for Field IDs, just fetch the Field from the Store
    (lib.metadata/field (qp.store/metadata-provider) field-id-or-name)
    ;; for field literals, we require `source-metadata` from the source query
    (matching-metadata-from-source-metadata field-id-or-name source-metadata)))

(mu/defn ^:private update-binned-field :- mbql.s/field
  "Given a `binning-strategy` clause, resolve the binning strategy (either provided or found if default is specified)
  and calculate the number of bins and bin width for this field. `field-id->filters` contains related criteria that
  could narrow the domain for the field. This info is saved as part of each `binning-strategy` clause."
  [{:keys [source-metadata], :as _inner-query}
   field-id->filters                          :- FieldID->Filters
   [_ id-or-name {:keys [binning], :as opts}] :- mbql.s/field]
  (let [metadata                                   (matching-metadata id-or-name source-metadata)
        {:keys [min-value max-value], :as min-max} (extract-bounds (when (integer? id-or-name) id-or-name)
                                                                   (:fingerprint metadata)
                                                                   field-id->filters)
        [new-strategy resolved-options]            (lib.binning.util/resolve-options (qp.store/metadata-provider)
                                                                                     (:strategy binning)
                                                                                     (get binning (:strategy binning))
                                                                                     metadata
                                                                                     min-value max-value)
        resolved-options                           (merge min-max resolved-options)
        ;; Bail out and use unmodifed version if we can't converge on a nice version.
        new-options (or (lib.binning.util/nicer-breakout new-strategy resolved-options)
                        resolved-options)]
    [:field id-or-name (update opts :binning merge {:strategy new-strategy} new-options)]))

(defn update-binning-strategy-in-inner-query
  "Update `:field` clauses with `:binning` strategy options in an `inner` [MBQL] query."
  [{filters :filter, :as inner-query}]
  (let [field-id->filters (filter->field-map filters)]
    (mbql.u/replace inner-query
      [:field _ (_ :guard :binning)]
      (try
        (update-binned-field inner-query field-id->filters &match)
        (catch Throwable e
          (throw (ex-info (.getMessage e) {:clause &match} e)))))))

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [{query-type :type, :as query}]
  (if (= query-type :native)
    query
    (update query :query update-binning-strategy-in-inner-query)))
