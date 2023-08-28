(ns metabase.query-processor.middleware.binning
  "Middleware that handles `:binning` strategy in `:field` clauses. This adds extra info to the `:binning` options maps
  that contain the information Query Processors will need in order to perform binning."
  (:require
   [clojure.math.numeric-tower :refer [ceil expt floor]]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Extracting Bounds ------------------------------------------------

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


;;; ------------------------------------------ Calculating resolved options ------------------------------------------

(mu/defn ^:private calculate-bin-width :- number?
  "Calculate bin width required to cover interval [`min-value`, `max-value`] with `num-bins`."
  [min-value :- number?
   max-value :- number?
   num-bins  :- ::lib.schema.common/positive-int]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(mu/defn ^:private calculate-num-bins :- ::lib.schema.common/positive-int
  "Calculate number of bins of width `bin-width` required to cover interval [`min-value`, `max-value`]."
  [min-value :- number?
   max-value :- number?
   bin-width :- [:and
                 number?
                 [:fn {:error/message "number >= 0"} (complement neg?)]]]
  (max (long (Math/ceil (/ (- max-value min-value)
                           bin-width)))
       1))

(def ^:private ResolvedStrategy
  [:tuple
   [:enum :bin-width :num-bins]
   [:map
    [:bin-width number?]
    [:num-bins ::lib.schema.common/positive-int]]])

(mu/defn ^:private resolve-default-strategy :- ResolvedStrategy
  "Determine the approprate strategy & options to use when `:default` strategy was specified."
  [metadata  :- lib.metadata/ColumnMetadata
   min-value :- number?
   max-value :- number?]
  (if (isa? (:semantic-type metadata) :type/Coordinate)
    (let [bin-width (public-settings/breakout-bin-width)]
      [:bin-width
       {:bin-width bin-width
        :num-bins  (calculate-num-bins min-value max-value bin-width)}])
    (let [num-bins (public-settings/breakout-bins-num)]
      [:num-bins
       {:num-bins  num-bins
        :bin-width (calculate-bin-width min-value max-value num-bins)}])))


;;; ------------------------------------- Humanized binning with nicer-breakout --------------------------------------

(defn- ceil-to
  [precision x]
  (let [scale (/ precision)]
    (/ (ceil (* x scale)) scale)))

(defn- floor-to
  [precision x]
  (let [scale (/ precision)]
    (/ (floor (* x scale)) scale)))

(def ^:private ^:const pleasing-numbers [1 1.25 2 2.5 3 5 7.5 10])

(mu/defn ^:private nicer-bin-width
  [min-value :- number?, max-value :- number?, num-bins :- ::lib.schema.common/positive-int]
  (let [min-bin-width (calculate-bin-width min-value max-value num-bins)
        scale         (expt 10 (u/order-of-magnitude min-bin-width))]
    (->> pleasing-numbers
         (map (partial * scale))
         (drop-while (partial > min-bin-width))
         first)))

(defn- nicer-bounds
  [min-value max-value bin-width]
  [(floor-to bin-width min-value) (ceil-to bin-width max-value)])

(def ^:private ^:const max-steps 10)

(defn- fixed-point
  [f]
  (fn [x]
    (->> (iterate f x)
         (partition 2 1)
         (take max-steps)
         (drop-while (partial apply not=))
         ffirst)))

(mu/defn ^:private nicer-breakout* :- :map
  "Humanize binning: extend interval to start and end on a \"nice\" number and, when number of bins is fixed, have a
  \"nice\" step (bin width)."
  [strategy                                         :- ::lib.schema.binning/strategy
   {:keys [min-value max-value bin-width num-bins]} :- :map]
  (let [bin-width             (if (= strategy :num-bins)
                                (nicer-bin-width min-value max-value num-bins)
                                bin-width)
        [min-value max-value] (nicer-bounds min-value max-value bin-width)]
    {:min-value min-value
     :max-value max-value
     :num-bins  (if (= strategy :num-bins)
                  num-bins
                  (calculate-num-bins min-value max-value bin-width))
     :bin-width bin-width}))

(mu/defn ^:private nicer-breakout :- [:maybe :map]
  [strategy :- ::lib.schema.binning/strategy
   opts     :- :map]
  (let [f (partial nicer-breakout* strategy)]
    ((fixed-point f) opts)))


;;; -------------------------------------------- Adding resolved options ---------------------------------------------

(mu/defn ^:private resolve-options :- ResolvedStrategy
  [strategy       :- ::lib.schema.binning/strategy
   strategy-param
   metadata       :- lib.metadata/ColumnMetadata
   min-value      :- number?
   max-value      :- number?]
  (case strategy
    :num-bins
    [:num-bins
     {:num-bins  strategy-param
      :bin-width (calculate-bin-width min-value max-value strategy-param)}]

    :bin-width
    [:bin-width
     {:bin-width strategy-param
      :num-bins  (calculate-num-bins min-value max-value strategy-param)}]

    :default
    (resolve-default-strategy metadata min-value max-value)))

(def ^:private PossiblyLegacyColumnMetadata
  [:map
   [:name :string]])

(mu/defn ^:private matching-metadata-from-source-metadata :- lib.metadata/ColumnMetadata
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
       (lib.equality/closest-matching-metadata
        [:field {:lib/uuid (str (random-uuid)), :base-type :type/*} field-name]
        mlv2-metadatas)
       (throw (ex-info (tru "Cannot update binned field: could not find matching source metadata for Field {0}"
                            (pr-str field-name))
                       {:field field-name, :resolved-metadata mlv2-metadatas}))))))

(def ^:private ColumnMetadata
  [:or
   lib.metadata/ColumnMetadata
   [:map
    [:fingerprint :any]]])

(mu/defn ^:private matching-metadata :- lib.metadata/ColumnMetadata
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
        [new-strategy resolved-options]            (resolve-options (:strategy binning)
                                                                    (get binning (:strategy binning))
                                                                    metadata
                                                                    min-value max-value)
        resolved-options                           (merge min-max resolved-options)
        ;; Bail out and use unmodifed version if we can't converge on a nice version.
        new-options (or (nicer-breakout new-strategy resolved-options)
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
