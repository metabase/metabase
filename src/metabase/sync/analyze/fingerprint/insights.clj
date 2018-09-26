(ns metabase.sync.analyze.fingerprint.insights
  "Deeper statistical analysis of results."
  (:require [kixi.stats.core :as stats]
            [metabase.sync.analyze.fingerprint.fingerprinters :as f]
            [redux.core :as redux]))

(defn- last-n
  [n]
  (fn
    ([] [])
    ([acc] acc)
    ([acc x]
     (if (< (count acc) n)
       (conj acc x)
       (conj (subvec acc 1) x)))))

(defn- first-value
  ([] nil)
  ([acc] (unreduced acc))
  ([_ x] (reduced x)))

(defn change
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (and x1 x2 (not (zero? x1)))
    (let [x2 (double x2)
          x1 (double x1)]
      (cond
        (every? neg? [x1 x2])     (change (- x1) (- x2))
        (and (neg? x1) (pos? x2)) (- (change x1 x2))
        (neg? x1)                 (- (change x2 x1))
        :else                     (/ (- x2 x1) x1)))))

(defn- timeseries?
  [{:keys [numbers datetimes others]}]
  (and (= (count numbers) 1)
       (= (count datetimes) 1)
       (empty? others)))

(defn- normalize-linear-function
  [[offset slope] start end n]
  (when (and offset slope start end)
    (let [model (fn [x]
                  (+ offset (* slope x)))
          unit  (if (> n 1)
                  (/ (- end start) (dec n))
                  1)]
      [(model start) (* unit slope)])))

(defn- timeseries-insight
  [{:keys [numbers datetimes]}]
  (redux/post-complete
   (let [x-position (-> datetimes first :position)
         y-position (-> numbers first :position)
         xfn        #(some-> %
                             (nth x-position)
                             f/->date
                             (.getTime))
         yfn        #(nth % y-position)]
     (redux/juxt ((map yfn) (last-n 2))
                 ((map xfn) first-value)
                 ((map xfn) (last-n 1))
                 stats/count
                 (stats/simple-linear-regression xfn yfn)))
   (fn [[[previous current] start [end] n linear-regression-coefficients]]
     (let [[offset slope] (normalize-linear-function linear-regression-coefficients start end n)]
       {:last-value     current
        :previous-value previous
        :last-change    (change current previous)
        :slope          slope
        :offset         offset}))))

(defn insights
  "Based on the shape of returned data construct a transducer to statistically analyize data."
  [cols]
  (let [cols-by-type (->> cols
                          (map-indexed (fn [idx col]
                                         (assoc col :position idx)))
                          (group-by (fn [{:keys [base_type unit]}]
                                      (cond
                                        (metabase.util.date/date-extract-units unit) :numbers
                                        (isa? base_type :type/Number)                :numbers
                                        (isa? base_type :type/DateTime)              :datetimes
                                        :else                                        :others))))]
    (cond
      (timeseries? cols-by-type) (timeseries-insight cols-by-type)
      :else                      (f/constant-fingerprinter nil))))
