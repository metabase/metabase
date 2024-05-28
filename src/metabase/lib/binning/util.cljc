(ns metabase.lib.binning.util
  (:require
   [clojure.math :as math]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn ^:private calculate-bin-width :- ::lib.schema.binning/bin-width
  "Calculate bin width required to cover interval [`min-value`, `max-value`] with `num-bins`."
  [min-value :- number?
   max-value :- number?
   num-bins  :- ::lib.schema.binning/num-bins]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(mu/defn ^:private calculate-num-bins :- ::lib.schema.binning/num-bins
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

(mu/defn ^:private resolve-default-strategy :- ResolvedStrategy
  "Determine the approprate strategy & options to use when `:default` strategy was specified."
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

(mu/defn ^:private nicer-bounds :- [:tuple number? number?]
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

(mu/defn ^:private nicer-breakout* :- :map
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
