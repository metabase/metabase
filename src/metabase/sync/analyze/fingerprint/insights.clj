(ns metabase.sync.analyze.fingerprint.insights
  "Deeper statistical analysis of results."
  (:require [kixi.stats.core :as stats]
            [metabase.models.field :as field]
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

(defn- timeseries-insight
  [{:keys [numbers datetimes]}]
  (redux/post-complete
   (let [datetime   (first datetimes)
         x-position (:position datetime)
         y-position (-> numbers first :position)
         xfn        (if (or (-> datetime :base_type (isa? :type/DateTime))
                            (field/unix-timestamp? datetime))
                      #(some-> %
                               (nth x-position)
                               ;; at this point in the pipeline, dates are still stings
                               f/->date
                               (.getTime))
                      ;; unit=year workaround. While the field is in this case marked as :type/Text,
                      ;; at this stage in the pipeline the value is still an int, so we can use it
                      ;; directly.
                      #(nth % x-position))
         yfn        #(nth % y-position)]
     (redux/juxt ((map yfn) (last-n 2))
                 (stats/simple-linear-regression xfn yfn)))
   (fn [[[previous current] [offset slope]]]
     {:last-value     current
      :previous-value previous
      :last-change    (change current previous)
      :slope          slope
      :offset         offset})))

(defn- datetime-truncated-to-year?
  "This is hackish as hell, but we change datetimes with year granularity to strings upstream and
   this is the only way to recover the information they were once datetimes."
  [{:keys [base_type unit fingerprint] :as field}]
  (and (= base_type :type/Text)
       (contains? field :unit)
       (nil? unit)
       (or (nil? (:type fingerprint))
           (-> fingerprint :type :type/DateTime))))

(defn insights
  "Based on the shape of returned data construct a transducer to statistically analyize data."
  [cols]
  (let [cols-by-type (->> cols
                          (map-indexed (fn [idx col]
                                         (assoc col :position idx)))
                          (group-by (fn [{:keys [base_type unit] :as field}]
                                      (cond
                                        (datetime-truncated-to-year? field)          :datetimes
                                        (metabase.util.date/date-extract-units unit) :numbers
                                        (field/unix-timestamp? field)                :datetimes
                                        (isa? base_type :type/Number)                :numbers
                                        (isa? base_type :type/DateTime)              :datetimes
                                        :else                                        :others))))]
    (cond
      (timeseries? cols-by-type) (timeseries-insight cols-by-type)
      :else                      (f/constant-fingerprinter nil))))
