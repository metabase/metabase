(ns metabase.sync.analyze.fingerprint.insights
  "Deeper statistical analysis of results."
  (:require
   [java-time.api :as t]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [kixi.stats.protocols :as p]
   [medley.core :as m]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [redux.core :as redux])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)))

(defn- last-n
  [n]
  (fn
    ([] [])
    ([acc]
     (concat (repeat (- n (count acc)) nil) acc))
    ([acc x]
     (if (< (count acc) n)
       (conj acc x)
       (conj (subvec acc 1) x)))))

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

(defn reservoir-sample
  "Transducer that samples a fixed number `n` of samples.
   https://en.wikipedia.org/wiki/Reservoir_sampling"
  [n]
  (fn
    ([] [[] 0])
    ([[reservoir c] x]
     (let [c   (inc c)
           idx (rand-int c)]
       (cond
         (<= c n)  [(conj reservoir x) c]
         (< idx n) [(assoc reservoir idx x) c]
         :else     [reservoir c])))
    ([[reservoir _]] reservoir)))

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
  [{:x-link-fn identity
    :y-link-fn identity
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope x))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope :x]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingExponential.html
   {:x-link-fn identity
    :y-link-fn math/log
    :model     (fn [offset slope]
                 (fn [x]
                   (* (math/exp offset) (math/exp (* slope x)))))
    :formula   (fn [offset slope]
                 [:* (math/exp offset) [:exp [:* slope :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingLogarithmic.html
   {:x-link-fn math/log
    :y-link-fn identity
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope (math/log x)))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope [:log :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingPowerLaw.html
   {:x-link-fn math/log
    :y-link-fn math/log
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
    {:fits           (->> (for [{:keys [x-link-fn y-link-fn formula model]} trendline-function-families]
                            (redux/post-complete
                             (stats/simple-linear-regression (comp (stats/somef x-link-fn) fx)
                                                             (comp (stats/somef y-link-fn) fy))
                             (fn [fit]
                               (let [[offset slope] (some-> fit p/parameters)]
                                 (when (every? u/real-number? [offset slope])
                                   {:model   (model offset slope)
                                    :formula (formula offset slope)})))))
                          (apply redux/juxt))
     :validation-set ((keep (fn [row]
                              (let [x (fx row)
                                    y (fy row)]
                                (when (and x y)
                                  [x y]))))
                      (reservoir-sample validation-set-size))})
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
  [{:keys [numbers datetimes others]}]
  (and (pos? (count numbers))
       (= (count datetimes) 1)
       (empty? others)))

;; We downsize UNIX timestamps to lessen the chance of overflows and numerical instabilities.
(def ^Long ^:const ^:private ms-in-a-day (* 1000 60 60 24))

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
    (let [[from to] (sort [from to])]
      (about= (- to from) (unit->duration unit)))))

(defn- infer-unit
  [from to]
  (m/find-first (partial valid-period? from to) (keys unit->duration)))

(defn- ->millis-from-epoch [t]
  (when t
    (condp instance? t
      Instant        (t/to-millis-from-epoch t)
      OffsetDateTime (t/to-millis-from-epoch t)
      ZonedDateTime  (t/to-millis-from-epoch t)
      LocalDate      (->millis-from-epoch (t/offset-date-time t (t/local-time 0) (t/zone-offset 0)))
      LocalDateTime  (->millis-from-epoch (t/offset-date-time t (t/zone-offset 0)))
      LocalTime      (->millis-from-epoch (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset 0)))
      OffsetTime     (->millis-from-epoch (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t))))))

(defn- timeseries-insight
  [{:keys [numbers datetimes]}]
  (let [datetime   (first datetimes)
        x-position (:position datetime)
        xfn        #(some-> %
                            (nth x-position)
                            ;; at this point in the pipeline, dates are still stings
                            fingerprinters/->temporal
                            ->millis-from-epoch
                            ms->day)]
    (fingerprinters/with-error-handling
      (apply redux/juxt
             (for [number-col numbers]
               (redux/post-complete
                (let [y-position (:position number-col)
                      yfn        #(nth % y-position)]
                  ((filter (comp u/real-number? yfn))
                   (redux/juxt ((map yfn) (last-n 2))
                               ((map xfn) (last-n 2))
                               (stats/simple-linear-regression xfn yfn)
                               (best-fit xfn yfn))))
                (fn [[[y-previous y-current] [x-previous x-current] fit best-fit-equation]]
                  (let [[offset slope] (some-> fit p/parameters)
                        unit         (let [unit (some-> datetime :unit mbql.u/normalize-token)]
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
                     :unit           unit))))))
      (format "Error generating timeseries insight keyed by: %s"
              (sync-util/name-for-logging (mi/instance Field datetime))))))

(defn insights
  "Based on the shape of returned data construct a transducer to statistically analyize data."
  [cols]
  (let [cols-by-type (->> cols
                          (map-indexed (fn [idx col]
                                         (assoc col :position idx)))
                          (group-by (fn [{base-type      :base_type
                                          effective-type :effective_type
                                          semantic-type  :semantic_type
                                          unit           :unit}]
                                      (cond
                                        (isa? semantic-type :Relation/*)                    :others
                                        (= unit :year)                                      :datetimes
                                        (u.date/extract-units unit)                         :numbers
                                        (isa? (or effective-type base-type) :type/Temporal) :datetimes
                                        (isa? base-type :type/Number)                       :numbers
                                        :else                                               :others))))]
    (cond
      (timeseries? cols-by-type) (timeseries-insight cols-by-type)
      :else                      (fingerprinters/constant-fingerprinter nil))))
