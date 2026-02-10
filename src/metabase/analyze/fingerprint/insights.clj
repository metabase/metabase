(ns metabase.analyze.fingerprint.insights
  "Deeper statistical analysis of results."
  (:require
   [java-time.api :as t]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [medley.core :as m]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.models.interface :as mi]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.performance :refer [mapv-indexed]]
   [redux.core :as redux])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Random)))

(set! *warn-on-reflection* true)

(defn- last-2 []
  (let [none (Object.)]
    (fn
      ([] (object-array [none none]))
      ([^objects acc]
       (let [a (aget acc 0)
             b (aget acc 1)]
         (cond (identical? b none) [nil nil]
               (identical? a none) [nil b]
               :else [a b])))
      ([^objects acc, x]
       (aset acc 0 (aget acc 1))
       (aset acc 1 x)
       acc))))

(defn change
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (and x1 x2 (not (zero? x1)))
    (let [x2 (double x2)
          x1 (double x1)]
      (cond
        (every? neg? [x1 x2])     (change (- x1) (- x2))
        (and (neg? x1) (pos? x2)) (- (change x1 x2))
        (neg? x1)                 (- (change x2 (- x1)))
        :else                     (/ (- x2 x1) x1)))))

(defn- reservoir-sample
  "Transducer that samples a fixed number `n` of samples consistently.
   https://en.wikipedia.org/wiki/Reservoir_sampling. Uses java.util.Random
  with a seed of `n` to ensure a consistent sample if a dataset has not changed.
  The returned instance is mutable, so don't reuse it. `f` is invoked on the element before adding it to the sample."
  [n f]
  (let [n (int n)
        rng (Random. n)
        counter (int-array 1) ;; A box for a mutable primitive int.
        reservoir (object-array n)]
    (fn
      ([] nil)
      ([_]
       (let [count (aget counter 0)]
         (vec (if (< count n)
                (java.util.Arrays/copyOfRange reservoir 0 count)
                reservoir))))
      ([_ x]
       (let [c   (aget counter (unchecked-int 0))
             c+1 (inc c)
             idx (.nextInt rng c+1)]
         (aset counter 0 c+1)
         (cond
           (< c n)   (aset reservoir c (f x))
           (< idx n) (aset reservoir idx (f x))))))))

(defn- simple-linear-regression
  "Faster and more efficient implementation of `kixi.stats.estimate/simple-linear-regression`. Computes some of squares
  on each step, and on the completing step returns `[offset slope]`. Additionally accepts `x-scale` and `y-scale`
  which should either be `:linear` or `:log`."
  [fx fy x-scale y-scale]
  (fn
    ([] (double-array 6))
    ([^doubles arr e]
     (let [x (fx e)
           y (fy e)]
       (if (or (nil? x) (nil? y))
         arr
         (let [x    (cond-> (double x)
                      (identical? x-scale :log) Math/log)
               y    (cond-> (double y)
                      (identical? y-scale :log) Math/log)
               c    (aget arr 0)
               mx   (aget arr 1)
               my   (aget arr 2)
               ssx  (aget arr 3)
               ssy  (aget arr 4)
               ssxy (aget arr 5)
               c'   (inc c)
               mx'  (+ mx (/ (- x mx) c'))
               my'  (+ my (/ (- y my) c'))]
           (aset arr 0 c')
           (aset arr 1 mx')
           (aset arr 2 my')
           (aset arr 3 (+ ssx  (* (- x mx') (- x mx))))
           (aset arr 4 (+ ssy  (* (- y my') (- y my))))
           (aset arr 5 (+ ssxy (* (- x mx') (- y my))))
           arr))))
    ([^doubles arr]
     (let [mx (aget arr 1)
           my (aget arr 2)
           ssx (aget arr 3)
           ssxy (aget arr 5)]
       (when-not (zero? ssx)
         (let [slope (/ ssxy ssx)
               offset (- my (* mx slope))]
           [offset slope]))))))

(defn mae
  "Given two functions: (fŷ input) and (fy input), returning the predicted and actual values of y
   respectively, calculates the mean absolute error of the estimate.
   https://en.wikipedia.org/wiki/Mean_absolute_error"
  [fy-hat fy]
  ((map (fn [x]
          (when x
            (math/abs (- (fy x) (fy-hat x))))))
   stats/mean))

(def ^:private trendline-function-families
  ;; http://mathworld.wolfram.com/LeastSquaresFitting.html
  [{:x-scale   :linear
    :y-scale   :linear
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope x))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope :x]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingExponential.html
   {:x-scale   :linear
    :y-scale   :log
    :model     (fn [offset slope]
                 (fn [x]
                   (* (math/exp offset) (math/exp (* slope x)))))
    :formula   (fn [offset slope]
                 [:* (math/exp offset) [:exp [:* slope :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingLogarithmic.html
   {:x-scale   :log
    :y-scale   :identity
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope (Math/log x)))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope [:log :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingPowerLaw.html
   {:x-scale   :log
    :y-scale   :log
    :model     (fn [offset slope]
                 (fn [x]
                   (* (math/exp offset) (math/pow x slope))))
    :formula   (fn [offset slope]
                 [:* (math/exp offset) [:pow :x slope]])}])

(def ^:private ^:const ^Long validation-set-size 20)

(defn- best-fit
  "Fit curves from `trendline-function-families` and pick the one with the smallest RMSE.
   To keep the operation single pass we collect a small validation set as we go using reservoir
   sampling, and use it to calculate RMSE."
  [fx fy]
  (redux/post-complete
   (fingerprinters/robust-fuse
    {:fits           (->> (for [{:keys [x-scale y-scale formula model]} trendline-function-families]
                            (redux/post-complete
                             (simple-linear-regression fx fy x-scale y-scale)
                             (fn [[offset slope]]
                               (when (every? u/real-number? [offset slope])
                                 {:model   (model offset slope)
                                  :formula (formula offset slope)}))))
                          redux/juxt*)
     :validation-set ((filter (fn [row] (and (fx row) (fy row))))
                      (reservoir-sample validation-set-size
                                        (fn [row] [(fx row) (fy row)])))})
   (fn [{:keys [validation-set fits]}]
     (some->> fits
              (remove nil?)
              (map #(assoc % :mae (transduce identity
                                             (mae (comp (:model %) first) second)
                                             validation-set)))
              (filter (comp u/real-number? :mae))
              not-empty
              (apply min-key :mae)
              :formula))))

(defn- timeseries?
  [{:keys [numbers datetimes]}]
  (and (pos? (count numbers))
       (= (count datetimes) 1)))

;; We downsize UNIX timestamps to lessen the chance of overflows and numerical instabilities.
(def ^Double ^:const ^:private ms-in-a-day (* 1000.0 60 60 24))

(defn- ms->day
  [dt]
  (/ dt ms-in-a-day))

(defn- about=
  [a b]
  (< 0.9 (/ a b) 1.1))

(def ^:private unit->duration
  {:minute  (/ 1 24 60)
   :hour    (/ 24)
   :day     1
   :week    7
   :month   30.5
   :quarter (* 30.4 3)
   :year    365.1})

(defn- valid-period?
  [from to unit]
  (when (and from to unit)
    ;; Make sure we work for both ascending and descending time series
    (let [[from to] (sort [from to])
          diff      (- to from)]
      (if (= unit :year)
        ;; Special handling for years: accept both 365 days (non-leap) and 366 days (leap year),
        ;; but reject anything less than 365 days
        (and (>= diff 364.5)
             (<= diff 366.5))
        (about= diff (unit->duration unit))))))

(defn- infer-unit
  [from to]
  (m/find-first (partial valid-period? from to) (keys unit->duration)))

(defn- ->millis-from-epoch [t]
  (cond (instance? Instant t)        (.toEpochMilli ^Instant t)
        (instance? OffsetDateTime t) (.toEpochMilli (.toInstant ^OffsetDateTime t))
        (instance? ZonedDateTime t)  (.toEpochMilli (.toInstant ^ZonedDateTime t))
        (instance? LocalDate t)      (recur (t/offset-date-time t (t/local-time 0) (t/zone-offset 0)))
        (instance? LocalDateTime t)  (recur (t/offset-date-time t (t/zone-offset 0)))
        (instance? LocalTime t)      (recur (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset 0)))
        (instance? OffsetTime t)     (recur (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t)))
        :else                        (throw (ex-info (str "->millis-from-epoch: unsupported type " (class t)) {}))))

(defn- timeseries-insight
  [{:keys [numbers datetimes]}]
  (let [datetime   (first datetimes)
        x-position (:position datetime)
        xfn        #(nth % x-position)]
    (fingerprinters/with-error-handling
      ((map (fn [row]
              ;; Convert string datetimes or Instants into into days-from-epoch, and BigDecimals into Doubles early.
              (mapv-indexed (fn [^long i x]
                              (cond (= i x-position)
                                    (some-> x
                                            fingerprinters/->temporal
                                            ->millis-from-epoch
                                            ms->day)
                                    (decimal? x) (double x)
                                    :else x))
                            row)))
       (redux/juxt*
        (for [number-col numbers]
          (redux/post-complete
           (let [y-position (:position number-col)
                 yfn        #(nth % y-position)]
             ((filter (comp u/real-number? yfn))
              (redux/juxt ((map yfn) (last-2))
                          ((map xfn) (last-2))
                          (simple-linear-regression xfn yfn :linear :linear)
                          (best-fit xfn yfn))))
           (fn [[[y-previous y-current] [x-previous x-current] [offset slope] best-fit-equation]]
             (let [unit         (let [unit (some-> datetime :unit keyword)]
                                  (if (or (nil? unit)
                                          (= unit :default))
                                    (infer-unit x-previous x-current)
                                    unit))
                   show-change? (valid-period? x-previous x-current unit)]
               (fingerprinters/robust-map
                :last-value     y-current
                :previous-value (when show-change?
                                  y-previous)
                :last-change    (when show-change?
                                  (change y-current y-previous))
                :slope          slope
                :offset         offset
                :best-fit       best-fit-equation
                :col            (:name number-col)
                :unit           unit)))))))
      (format "Error generating timeseries insight keyed by: %s"
              (sync-util/name-for-logging (mi/instance :model/Field datetime))))))

(defn insights
  "Based on the shape of returned data construct a transducer to statistically analyze data."
  [cols]
  (let [cols-by-type (->> cols
                          (map-indexed (fn [idx col]
                                         (assoc col :position idx)))
                          (group-by (fn [{base-type      :base_type
                                          effective-type :effective_type
                                          semantic-type  :semantic_type
                                          unit           :unit
                                          source         :source
                                          lib-source     :lib/source
                                          lib-breakout?  :lib/breakout?}]
                                      (cond
                                        ;; Only count datetime columns from breakouts/dimensions, not aggregations
                                        ;; Aggregations of datetime values (like max(created_at)) are computed values,
                                        ;; not datetime dimensions for the X-axis (#62069)
                                        ;; Datetime columns with FK/PK semantic types should still be recognized as
                                        ;; datetimes for timeseries insights (#35281)
                                        (and
                                         (or (u.date/truncate-units unit)
                                             (isa? (or effective-type base-type) :type/Temporal))
                                         (or lib-breakout?
                                             (= source :breakout)
                                             (and (not= source :aggregation)
                                                  (not (= lib-source :source/aggregations)))))
                                        :datetimes

                                        (u.date/extract-units unit) :numbers
                                        ;; Don't treat numeric FK/PK columns as numbers - they are identifiers, not
                                        ;; values to compute insights over
                                        (and (isa? base-type :type/Number)
                                             (not (isa? semantic-type :Relation/*)))
                                        :numbers
                                        :else :others))))]
    (cond
      (timeseries? cols-by-type) (timeseries-insight cols-by-type)
      :else (fingerprinters/constant-fingerprinter nil))))
