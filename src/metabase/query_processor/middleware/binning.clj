(ns metabase.query-processor.middleware.binning
  "Middleware that handles `:binning` strategy in `:field` clauses. This adds extra info to the `:binning` options maps
  that contain the information Query Processors will need in order to perform binning."
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *query*
  nil)

(def ^:private ^:dynamic *parents*
  nil)

(def ^:private FieldIDOrName->Filters
  [:map-of [:or ::lib.schema.id/field ::lib.schema.common/non-blank-string] [:sequential mbql.s/Filter]])

(mu/defn- filter->field-map :- FieldIDOrName->Filters
  "Find any comparison or `:between` filter and return a map of referenced Field ID or Name -> all the clauses the reference
  it."
  [filter-clause :- [:maybe mbql.s/Filter]]
  (reduce
   (partial merge-with concat)
   {}
   (for [subclause (lib.util.match/match filter-clause #{:between :< :<= :> :>=})
         field-id-or-name (lib.util.match/match subclause [:field field-id-or-name _] field-id-or-name)]
     {field-id-or-name [subclause]})))

(mu/defn- extract-bounds :- [:map [:min-value number?] [:max-value number?]]
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [field-id-or-name  :- [:maybe [:or ::lib.schema.id/field ::lib.schema.common/non-blank-string]]
   fingerprint       :- [:maybe :map]
   field-id-or-name->filters :- FieldIDOrName->Filters]
  (let [{global-min :min, global-max :max} (get-in fingerprint [:type :type/Number])
        filter-clauses                     (get field-id-or-name->filters field-id-or-name)
        ;; [:between <field> <min> <max>] or [:< <field> <x>]
        user-maxes                         (lib.util.match/match filter-clauses
                                             [(_ :guard #{:< :<= :between}) & args] (last args))
        user-mins                          (lib.util.match/match filter-clauses
                                             [(_ :guard #{:> :>= :between}) _ min-val & _] min-val)
        min-value                          (or (when (seq user-mins)
                                                 (apply max user-mins))
                                               global-min)
        max-value                          (or (when (seq user-maxes)
                                                 (apply min user-maxes))
                                               global-max)]
    (when-not (and min-value max-value)
      (throw (ex-info (tru "Unable to bin Field without a min/max value (missing or incomplete fingerprint)")
                      {:type qp.error-type/invalid-query
                       :field-id-or-name field-id-or-name
                       :fingerprint fingerprint})))
    {:min-value min-value, :max-value max-value}))

(def ^:private PossiblyLegacyColumnMetadata
  [:map
   [:name :string]])

(mu/defn- matching-metadata-from-source-metadata :- ::lib.schema.metadata/column
  [field-name      :- ::lib.schema.common/non-blank-string
   source-metadata :- [:maybe [:sequential PossiblyLegacyColumnMetadata]]]
  (do
    ;; make sure source-metadata exists
    (when-not source-metadata
      (throw (ex-info (tru "Cannot update binned field: query is missing source-metadata")
                      {:field field-name})))
    ;; try to find field in source-metadata with matching name
    (let [mlv2-metadatas (lib.card/->card-metadata-columns (qp.store/metadata-provider) source-metadata)]
      (or
       (lib.equality/find-matching-column
        [:field {:lib/uuid (str (random-uuid)), :base-type :type/*} field-name]
        mlv2-metadatas)
       (throw (ex-info (tru "Cannot update binned field: could not find matching source metadata for Field {0}"
                            (pr-str field-name))
                       {:field field-name, :resolved-metadata mlv2-metadatas}))))))

(mu/defn- matching-metadata :- ::lib.schema.metadata/column
  [field-id-or-name :- [:or ::lib.schema.id/field ::lib.schema.common/non-blank-string]
   source-metadata  :- [:maybe [:sequential PossiblyLegacyColumnMetadata]]]
  (if (integer? field-id-or-name)
    ;; for Field IDs, just fetch the Field from the Store
    (lib.metadata/field (qp.store/metadata-provider) field-id-or-name)
    ;; for field literals, we require `source-metadata` from the source query
    (matching-metadata-from-source-metadata field-id-or-name source-metadata)))

(defonce ahoj (atom []))
(comment
  (reset! ahoj []))

;; SHOULD create a query with subset of keys and new aggregations
;; next step is to create a query for PARENTS!

(def query-base-keys [:source-table :joins :filter :expressions])

;; TODO: Make it work with expr, ie need query base with filters?
;;       Question is whether we want fingerprint prior filtering, should we include joins???
;;
;; TODO: Could this re-use process multiple from pivoting code?
;;
;;

(defn dummy-adhoc-bounds
  [ref]
  ;; here I must ensure there is no binning in that query!!! does that make sense?
  (let [sanitized-ref (update ref 2 dissoc :binning)
        query-for-minmax (-> *query*
                             (dissoc :middleware :info :constraints)
                             #_(update :info dissoc :query-hash)
                             (update :query #(select-keys % query-base-keys)))
        with-aggregation (assoc-in query-for-minmax [:query :aggregation] [[:max sanitized-ref]
                                                                           [:min sanitized-ref]])]
    (assert (nil? (lib.util.match/match with-aggregation [#{:field :expression} _ (_opts :guard :binning)])))
    (def qqq with-aggregation)
    (let [res (atom nil)]
      (.start (Thread. (fn [] (reset! res ((requiring-resolve 'metabase.query-processor/process-query) with-aggregation)))))
      (Thread/sleep 500)
      (def rere @res))
    rere
    #_@(def rrr ((requiring-resolve 'metabase.query-processor/process-query) with-aggregation))))

(defn dummy-adhoc-extract-bounds
  [ref]
  (zipmap [:max-value :min-value]
          (get-in (dummy-adhoc-bounds ref)
                  [:data :rows 0])))

(mu/defn- update-binned-field
  "Given a `binning-strategy` clause, resolve the binning strategy (either provided or found if default is specified)
  and calculate the number of bins and bin width for this field. `field-id->filters` contains related criteria that
  could narrow the domain for the field. This info is saved as part of each `binning-strategy` clause."
  [{:keys [source-metadata], :as _inner-query}
   field-id-or-name->filters                  :- :any #_FieldIDOrName->Filters
   [_ id-or-name {:keys [binning], :as opts} :as fref] :- :any]
  (def fff fref)
  (let [r (let [metadata                                   (try (matching-metadata id-or-name source-metadata)
                                                                (catch Exception _))
                ;; this here mix max val
                #_#_{:keys [min-value max-value], :as min-max} (extract-bounds id-or-name
                                                                               (:fingerprint metadata)
                                                                               field-id-or-name->filters)
                {:keys [min-value max-value], :as min-max} @(def mimi (dummy-adhoc-extract-bounds fref))
                [new-strategy resolved-options]            @(def ww (lib.binning.util/resolve-options (qp.store/metadata-provider)
                                                                                                      (:strategy binning)
                                                                                                      (get binning (:strategy binning))
                                                                                                      metadata
                                                                                                      min-value max-value))
                resolved-options                           (merge min-max resolved-options)
        ;; Bail out and use unmodifed version if we can't converge on a nice version.
                new-options (or #_(lib.binning.util/nicer-breakout new-strategy resolved-options)
                             resolved-options)]
            @(def rii (assoc fref 2 (update opts :binning merge {:strategy new-strategy} new-options)))
            #_[:field id-or-name (update opts :binning merge {:strategy new-strategy} new-options)])]
    #_(swap! ahoj conj {:ref fref
                        :res r
                        :query *query*
                        :field-parents *parents*})
    #_(dummy-adhoc-bounds fref)
    r))

(defn update-binning-strategy-in-inner-query
  "Update `:field` clauses with `:binning` strategy options in an `inner` [MBQL] query."
  [{filters :filter, :as inner-query}]
  (let [field-id-or-name->filters (filter->field-map filters)]
    (lib.util.match/replace
     inner-query
     ;;
     ;; should not be doubled -- how to match for :field or :expression
     [:field _ (_ :guard :binning)]
     (try
       (binding [*parents* &parents]
         (update-binned-field inner-query field-id-or-name->filters &match))
       (catch Throwable e
         (throw (ex-info (.getMessage e) {:clause &match} e))))
     [:expression _ (_ :guard :binning)]
     (try
       (binding [*parents* &parents]
         (update-binned-field inner-query field-id-or-name->filters &match))
       (catch Throwable e
         (throw (ex-info (.getMessage e) {:clause &match} e)))))))

;; post-walk the query
;;

(defn- back-bins-by-series
  [query]
  (swap! ahoj conj query)
  query)

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [{query-type :type, :as query}]
  (if (= query-type :native)
    query
    (binding [*query* query]
      (-> query
          (update :query update-binning-strategy-in-inner-query)
          #_(update :query back-bins-by-series)))))
