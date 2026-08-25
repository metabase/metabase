(ns metabase.lib.binning.util
  (:refer-clojure :exclude [get-in some])
  (:require
   [clojure.math :as math]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.performance :refer [get-in some]]))

(mr/def ::field-id-or-name->filters
  [:map-of [:or ::lib.schema.id/field :string] [:sequential ::lib.schema.expression/boolean]])

(mu/defn filters->field-map :- ::field-id-or-name->filters
  "Find any comparison or `:between` filter and return a map of referenced Field ID or Name -> all the clauses that
  reference it."
  [filters :- [:maybe [:sequential ::lib.schema.expression/boolean]]]
  (reduce
   (partial merge-with concat)
   {}
   (for [subclause        (match/match-many filters [#{:between :< :<= :> :>=} & _] &match)
         field-id-or-name (match/match-many subclause [:field _opts field-id-or-name] field-id-or-name)]
     {field-id-or-name [subclause]})))

(mu/defn extract-bounds :- [:maybe [:map [:min-value number?] [:max-value number?]]]
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field. Returns nil when no bound can be determined at all (e.g. a missing or incomplete fingerprint)."
  [field-id-or-name          :- [:maybe [:or ::lib.schema.id/field :string]]
   fingerprint               :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]
   field-id-or-name->filters :- ::field-id-or-name->filters]
  (let [{global-min :min, global-max :max} (get-in fingerprint [:type :type/Number])
        filter-clauses                     (get field-id-or-name->filters field-id-or-name)
        ;; [:between <field> <min> <max>] or [:< <field> <x>]
        user-maxes                         (match/match-many filter-clauses
                                             [#{:< :<= :between} _opts & args] (last args))
        user-mins                          (match/match-many filter-clauses
                                             [#{:> :>= :between} _opts _field min-val & _] min-val)
        min-value                          (or (when (seq user-mins)
                                                 (apply max user-mins))
                                               global-min)
        max-value                          (or (when (seq user-maxes)
                                                 (apply min user-maxes))
                                               global-max)]
    (when (and min-value max-value)
      {:min-value min-value, :max-value max-value})))

(mu/defn- calculate-bin-width :- ::lib.schema.binning/bin-width
  "Calculate bin width required to cover interval [`min-value`, `max-value`] with `num-bins`."
  [min-value :- number?
   max-value :- number?
   num-bins  :- ::lib.schema.binning/num-bins]
  (let [width (u/round-to-decimals 5 (/ (- max-value min-value)
                                        num-bins))]
    (if (zero? width)
      1                         ; a nice (in the sense of [[nicer-bin-width]]), positive but otherwise arbitrary width
      width)))

(mu/defn- calculate-num-bins :- ::lib.schema.binning/num-bins
  "Calculate number of bins of width `bin-width` required to cover interval [`min-value`, `max-value`]."
  [min-value :- number?
   max-value :- number?
   bin-width :- ::lib.schema.binning/bin-width]
  (max (long (math/ceil (/ (- max-value min-value)
                           bin-width)))
       1))

(def ^:private ResolvedStrategy
  [:tuple
   [:enum :bin-width :num-bins]
   [:map
    [:bin-width ::lib.schema.binning/bin-width]
    [:num-bins  ::lib.schema.binning/num-bins]]])

(mu/defn- resolve-default-strategy :- ResolvedStrategy
  "Determine the appropriate strategy & options to use when `:default` strategy was specified."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column                :- ::lib.schema.metadata/column
   min-value             :- number?
   max-value             :- number?]
  (if (lib.types.isa/coordinate? column)
    (let [bin-width (lib.metadata/setting metadata-providerable :breakout-bin-width)]
      [:bin-width
       {:bin-width bin-width
        :num-bins  (calculate-num-bins min-value max-value bin-width)}])
    (let [num-bins (lib.metadata/setting metadata-providerable :breakout-bins-num)]
      [:num-bins
       {:num-bins  num-bins
        :bin-width (calculate-bin-width min-value max-value num-bins)}])))

;;; ------------------------------------- Humanized binning with nicer-breakout --------------------------------------

(defn- ceil-to
  [precision x]
  (* (math/ceil (/ x precision)) precision))

(defn- floor-to
  [precision x]
  (* (math/floor (/ x precision)) precision))

(def ^:private pleasing-numbers [1 1.25 2 2.5 3 5 7.5 10])

(mu/defn nicer-bin-width :- ::lib.schema.binning/bin-width
  "Calculate the bin width we should use for `:num-bins` binning based on `min-value` and `max-value`, taken from a
  column's fingerprint... rather than simply doing

    (/ (- max-value min-value) num-bins)

  this function attempts to return a 'pleasing' bin width, e.g. 20 instead of 15.01."
  [min-value :- number?
   max-value :- number?
   num-bins  :- ::lib.schema.binning/num-bins]
  (let [min-bin-width (calculate-bin-width min-value max-value num-bins)
        scale         (math/pow 10 (u/order-of-magnitude min-bin-width))]
    (some (fn [pleasing-number]
            (let [candidate-width (* pleasing-number scale)]
              (when (>= candidate-width min-bin-width)
                candidate-width)))
          pleasing-numbers)))

(mu/defn- nicer-bounds :- [:tuple number? number?]
  [min-value :- number?
   max-value :- number?
   bin-width :- ::lib.schema.binning/bin-width]
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

(mu/defn- nicer-breakout* :- :map
  "Humanize binning: extend interval to start and end on a \"nice\" number and, when number of bins is fixed, have a
  \"nice\" step (bin width)."
  [strategy                                         :- ::lib.schema.binning/strategy
   {:keys [min-value max-value bin-width num-bins]} :- [:map
                                                        [:min-value number?]
                                                        [:max-value number?]
                                                        [:bin-width {:optional true} ::lib.schema.binning/bin-width]
                                                        [:num-bins  {:optional true} ::lib.schema.binning/num-bins]]]
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

(mu/defn nicer-breakout :- [:maybe :map]
  "Make the current breakout a little nicer? Not 100% sure exactly how this is used, refer
  to [[metabase.query-processor.middleware.binning/update-binned-field]]."
  [strategy :- ::lib.schema.binning/strategy
   opts     :- :map]
  (let [f (partial nicer-breakout* strategy)]
    ((fixed-point f) opts)))

(mu/defn resolve-options :- ResolvedStrategy
  "Given any binning `:strategy`, determine the `:bin-width` and `:num-bins` we should use based on the column's
  fingerprint."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   strategy              :- ::lib.schema.binning/strategy
   strategy-param        :- [:maybe number?]
   column                :- ::lib.schema.metadata/column
   min-value             :- number?
   max-value             :- number?]
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
    (resolve-default-strategy metadata-providerable column min-value max-value)))
