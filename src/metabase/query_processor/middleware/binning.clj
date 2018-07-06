(ns metabase.query-processor.middleware.binning
  (:require [clojure.math.numeric-tower :refer [ceil expt floor]]
            [clojure.walk :as walk]
            [metabase
             [public-settings :as public-settings]
             [util :as u]])
  (:import [metabase.query_processor.interface BetweenFilter BinnedField ComparisonFilter]))

(defn- update!
  "Similar to `clojure.core/update` but works on transient maps"
  [^clojure.lang.ITransientAssociative coll k f]
  (assoc! coll k (f (get coll k))))

(defn- filter->field-map
  "A bit of a stateful hack using clojure.walk/prewalk to find any comparison or between filter. This should be replaced
  by a zipper for a more functional/composable approach to this problem."
  [mbql-filter]
  (let [acc (transient {})]
    (walk/prewalk
     (fn [x]
       (when (or (instance? BetweenFilter x)
                 (and (instance? ComparisonFilter x)
                      (contains? #{:< :> :<= :>=} (:filter-type x))))
         (update! acc (get-in x [:field :field-id]) #(if (seq %)
                                                       (conj % x)
                                                       [x])))
       x)
     mbql-filter)
    (persistent! acc)))

(defn calculate-bin-width
  "Calculate bin width required to cover interval [`min-value`, `max-value`] with `num-bins`."
  [min-value max-value num-bins]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(defn calculate-num-bins
  "Calculate number of bins of width `bin-width` required to cover interval [`min-value`, `max-value`]."
  [min-value max-value bin-width]
  (long (Math/ceil (/ (- max-value min-value)
                         bin-width))))

(defn- extract-bounds
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [{:keys [field-id fingerprint]} field-filter-map]
  (let [{global-min :min, global-max :max} (get-in fingerprint [:type :type/Number])
        user-maxes (for [{:keys [filter-type] :as query-filter} (get field-filter-map field-id)
                         :when (contains? #{:< :<= :between} filter-type)]
                     (if (= :between filter-type)
                       (get-in query-filter [:max-val :value])
                       (get-in query-filter [:value :value])))
        user-mins (for [{:keys [filter-type] :as query-filter} (get field-filter-map field-id)
                        :when (contains? #{:> :>= :between} filter-type)]
                    (if (= :between filter-type)
                      (get-in query-filter [:min-val :value])
                      (get-in query-filter [:value :value])))]
    [(or (when (seq user-mins)
           (apply max user-mins))
         global-min)
     (or (when (seq user-maxes)
           (apply min user-maxes))
         global-max)]))

(defn- ceil-to
  [precision x]
  (let [scale (/ precision)]
    (/ (ceil (* x scale)) scale)))

(defn- floor-to
  [precision x]
  (let [scale (/ precision)]
    (/ (floor (* x scale)) scale)))

(def ^:private ^:const pleasing-numbers [1 1.25 2 2.5 3 5 7.5 10])

(defn- nicer-bin-width
  [min-value max-value num-bins]
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

(def ^{:arglists '([binned-field])} nicer-breakout
  "Humanize binning: extend interval to start and end on a \"nice\" number and, when number of bins is fixed, have a
  \"nice\" step (bin width)."
  (fixed-point
   (fn
     [{:keys [min-value max-value bin-width num-bins strategy] :as binned-field}]
     (let [bin-width (if (= strategy :num-bins)
                       (nicer-bin-width min-value max-value num-bins)
                       bin-width)
           [min-value max-value] (nicer-bounds min-value max-value bin-width)]
       (-> binned-field
           (assoc :min-value min-value
                  :max-value max-value
                  :num-bins  (if (= strategy :num-bins)
                               num-bins
                               (calculate-num-bins min-value max-value bin-width))
                  :bin-width bin-width))))))

(defn- resolve-default-strategy [{:keys [strategy field]} min-value max-value]
  (if (isa? (:special-type field) :type/Coordinate)
    (let [bin-width (public-settings/breakout-bin-width)]
      {:strategy  :bin-width
       :bin-width bin-width
       :num-bins  (calculate-num-bins min-value max-value bin-width)})
    (let [num-bins (public-settings/breakout-bins-num)]
      {:strategy  :num-bins
       :num-bins  num-bins
       :bin-width (calculate-bin-width min-value max-value num-bins)})))

(defn- update-binned-field
  "Given a field, resolve the binning strategy (either provided or found if default is specified) and calculate the
  number of bins and bin width for this file. `filter-field-map` contains related criteria that could narrow the
  domain for the field."
  [{:keys [field num-bins strategy bin-width] :as binned-field} filter-field-map]
  (let [[min-value max-value] (extract-bounds field filter-field-map)]
    (when-not (and min-value max-value)
      (throw (Exception. (format "Unable to bin field '%s' with id '%s' without a min/max value"
                                 (get-in binned-field [:field :field-name])
                                 (get-in binned-field [:field :field-id])))))
    (let [resolved-binned-field (merge binned-field
                                       {:min-value min-value :max-value max-value}
                                       (case strategy

                                         :num-bins
                                         {:bin-width (calculate-bin-width min-value max-value num-bins)}

                                         :bin-width
                                         {:num-bins (calculate-num-bins min-value max-value bin-width)}

                                         :default
                                         (resolve-default-strategy binned-field min-value max-value)))]
      ;; Bail out and use unmodifed version if we can't converge on a
      ;; nice version.
      (or (nicer-breakout resolved-binned-field) resolved-binned-field))))

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [qp]
  (fn [query]
    (let [filter-field-map (filter->field-map (get-in query [:query :filter]))]
      (qp
       (walk/postwalk (fn [node]
                        (if (instance? BinnedField node)
                          (update-binned-field node filter-field-map)
                          node))
                      query)))))
