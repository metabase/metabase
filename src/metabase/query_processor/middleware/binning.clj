(ns metabase.query-processor.middleware.binning
  "Middleware that handles `binning-strategy` Field clauses. This adds a `resolved-options` map to every
  `binning-strategy` clause that contains the information query processors will need in order to perform binning."
  (:require [clojure.math.numeric-tower :refer [ceil expt floor]]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

;;; ----------------------------------------------- Extracting Bounds ------------------------------------------------

(def ^:private FieldID->Filters {su/IntGreaterThanZero [mbql.s/Filter]})

(s/defn ^:private filter->field-map :- FieldID->Filters
  "Find any comparison or `:between` filter and return a map of referenced Field ID -> all the clauses the reference
  it."
  [filter-clause :- (s/maybe mbql.s/Filter)]
  (reduce
   (partial merge-with concat)
   {}
   (for [subclause (mbql.u/match filter-clause #{:between :< :<= :> :>=})
         field-id  (mbql.u/match subclause [:field-id field-id] field-id)]
     {field-id [subclause]})))

(s/defn ^:private extract-bounds :- {:min-value s/Num, :max-value s/Num}
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [field-id :- (s/maybe su/IntGreaterThanZero), fingerprint :- (s/maybe su/Map), field-id->filters :- FieldID->Filters]
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
      (throw (Exception. (str (tru "Unable to bin Field without a min/max value")))))
    {:min-value min-value, :max-value max-value}))


;;; ------------------------------------------ Calculating resolved options ------------------------------------------

(s/defn ^:private calculate-bin-width :- s/Num
  "Calculate bin width required to cover interval [`min-value`, `max-value`] with `num-bins`."
  [min-value :- s/Num, max-value :- s/Num, num-bins :- su/IntGreaterThanZero]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(s/defn ^:private calculate-num-bins :- su/IntGreaterThanZero
  "Calculate number of bins of width `bin-width` required to cover interval [`min-value`, `max-value`]."
  [min-value :- s/Num, max-value :- s/Num, bin-width :- (s/constrained s/Num (complement neg?) "number >= 0")]
  (long (Math/ceil (/ (- max-value min-value)
                      bin-width))))

(s/defn ^:private resolve-default-strategy :- [(s/one (s/enum :bin-width :num-bins) "strategy")
                                               (s/one {:bin-width s/Num, :num-bins su/IntGreaterThanZero} "opts")]
  "Determine the approprate strategy & options to use when `:default` strategy was specified."
  [metadata :- {:special_type (s/maybe su/FieldType), s/Any s/Any}, min-value :- s/Num, max-value :- s/Num]
  (if (isa? (:special_type metadata) :type/Coordinate)
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

(s/defn ^:private nicer-bin-width
  [min-value :- s/Num, max-value :- s/Num, num-bins :- su/IntGreaterThanZero]
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

(s/defn ^:private nicer-breakout* :- mbql.s/ResolvedBinningStrategyOptions
  "Humanize binning: extend interval to start and end on a \"nice\" number and, when number of bins is fixed, have a
  \"nice\" step (bin width)."
  [strategy                                         :- mbql.s/BinningStrategyName
   {:keys [min-value max-value bin-width num-bins]} :- mbql.s/ResolvedBinningStrategyOptions]
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

(s/defn ^:private nicer-breakout :- (s/maybe mbql.s/ResolvedBinningStrategyOptions)
  [strategy :- mbql.s/BinningStrategyName, opts :- mbql.s/ResolvedBinningStrategyOptions]
  (let [f (partial nicer-breakout* strategy)]
    ((fixed-point f) opts)))


;;; -------------------------------------------- Adding resolved options ---------------------------------------------

(defn- resolve-options [strategy strategy-param metadata min-value max-value]
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

(s/defn ^:private update-binned-field :- mbql.s/binning-strategy
  "Given a `binning-strategy` clause, resolve the binning strategy (either provided or found if default is specified)
  and calculate the number of bins and bin width for this field. `field-id->filters` contains related criteria that
  could narrow the domain for the field. This info is saved as part of each `binning-strategy` clause."
  [query, field-id->filters :- FieldID->Filters, [_ field-clause strategy strategy-param] :- mbql.s/binning-strategy]
  (let [field-id-or-name                (mbql.u/field-clause->id-or-literal field-clause)
        metadata                        (if (integer? field-id-or-name)
                                          (qp.store/field field-id-or-name)
                                          (some (fn [metadata]
                                                  (when (= (:name metadata) field-id-or-name)
                                                    metadata))
                                                (:source-metadata query)))
        {:keys [min-value max-value]
         :as   min-max}                 (extract-bounds (when (integer? field-id-or-name) field-id-or-name)
                                                        (:fingerprint metadata)
                                                        field-id->filters)
        [new-strategy resolved-options] (resolve-options strategy strategy-param metadata min-value max-value)
        resolved-options (merge min-max resolved-options)]
    ;; Bail out and use unmodifed version if we can't converge on a nice version.
    [:binning-strategy field-clause new-strategy strategy-param (or (nicer-breakout new-strategy resolved-options)
                                                                    resolved-options)]))


(defn- update-binning-strategy* [{query-type :type, :as query}]
  (if (= query-type :native)
    query
    (let [field-id->filters (filter->field-map (get-in query [:query :filter]))]
      (mbql.u/replace-in query [:query]
        :binning-strategy
        (update-binned-field query field-id->filters &match)))))

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [qp]
  (comp qp update-binning-strategy*))
