(ns metabase.query-processor.middleware.binning
  (:require [clojure.math.numeric-tower :refer [ceil floor expt]]
            [clojure.walk :as walk]
            [metabase.util :as u]
            [metabase.query-processor.interface :as i]
            [metabase.public-settings :as public-settings])
  (:import [metabase.query_processor.interface BinnedField ComparisonFilter BetweenFilter]))

(defn- update!
  "Similar to `clojure.core/update` but works on transient maps"
  [^clojure.lang.ITransientAssociative coll k f]
  (assoc! coll k (f (get coll k))))

(defn- filter->field-map
  "A bit of a stateful hack using clojure.walk/prewalk to find any
  comparison or between filter. This should be replaced by a zipper
  for a more functional/composable approach to this problem."
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

(defn- calculate-bin-width [min-value max-value num-bins]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(defn- calculate-num-bins [min-value max-value bin-width]
  (long (Math/ceil (/ (- max-value min-value)
                         bin-width))))

(defn- extract-bounds
  "Given query criteria, find a min/max value for the binning strategy
  using the greatest user specified min value and the smallest user
  specified max value. When a user specified min or max is not found,
  use the global min/max for the given field."
  [{field-id :field-id, global-min :min-value, global-max :max-value} field-filter-map]
  (let [user-maxes (for [{:keys [filter-type] :as query-filter} (get field-filter-map field-id)
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

(defn- order-of-magnitude
  [x]
  (floor (/ (Math/log x) (Math/log 10))))

(def ^:private ^:const pleasing-numbers [1 1.25 2 2.5 3 5 7.5 10])

(defn- nicer-bin-width
  [min-value max-value num-bins]
  (let [min-bin-width (calculate-bin-width min-value max-value num-bins)
        scale         (expt 10 (order-of-magnitude min-bin-width))]
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

(def ^:private ^{:arglists '([breakout])} nicer-breakout
  (fixed-point
   (fn
     [{:keys [min-value max-value bin-width num-bins strategy] :as breakout}]
     (let [bin-width (if (= strategy :num-bins)
                       (nicer-bin-width min-value max-value num-bins)
                       bin-width)
           [min-value max-value] (nicer-bounds min-value max-value bin-width)]
       (-> breakout
           (assoc :min-value min-value
                  :max-value max-value
                  :num-bins  (if (= strategy :num-bins)
                               num-bins
                               (calculate-num-bins min-value max-value bin-width))
                  :bin-width bin-width))))))

(defn- resolve-default-strategy [{:keys [strategy field min-value max-value] :as breakout}]
  (if (isa? (:special-type field) :type/Coordinate)
    (let [bin-width (public-settings/breakout-bin-width)]
      (assoc breakout
        :strategy  :bin-width
        :bin-width bin-width
        :num-bins  (calculate-num-bins min-value max-value bin-width)))
    (let [num-bins (public-settings/breakout-bins-num)]
      (assoc breakout
        :strategy  :num-bins
        :num-bins  num-bins
        :bin-width (calculate-bin-width min-value max-value num-bins)))))

(defn- update-binned-field
  "Given a field, resolve the binning strategy (either provided or
  found if default is specified) and calculate the number of bins and
  bin width for this file. `FILTER-FIELD-MAP` contains related
  criteria that could narrow the domain for the field."
  [{:keys [field num-bins strategy bin-width] :as breakout} filter-field-map]
  (let [[min-value max-value] (extract-bounds field filter-field-map)]
    (when-not (and min-value max-value)
      (throw (Exception. (format "Unable to bin field '%s' with id '%s' without a min/max value"
                                 (get-in breakout [:field :field-name])
                                 (get-in breakout [:field :field-id])))))
    (let [breakout-with-min-max (assoc breakout :min-value min-value :max-value max-value)
          resolved-breakout (case strategy

                              :num-bins
                              (assoc breakout-with-min-max
                                :bin-width (calculate-bin-width min-value
                                                                max-value
                                                                num-bins))

                              :bin-width
                              (assoc breakout-with-min-max
                                :num-bins (calculate-num-bins min-value
                                                              max-value
                                                              bin-width))

                              :default
                              (resolve-default-strategy breakout-with-min-max))]
      ;; Bail out and use unmodifed version if we can't converge on a
      ;; nice version.
      (or (nicer-breakout resolved-breakout) resolved-breakout))))

(defn- update-binned-fields
  "Maps over `BREAKOUTS` resolving the binning strategy and
  calculating bin widths and number of bins."
  [breakouts filter-field-map]
  (mapv (fn [{:keys [field num-bins strategy bin-width] :as breakout}]
          (cond

            (instance? BinnedField breakout)
            (update-binned-field breakout filter-field-map)

            (and (contains? breakout :direction)
                 (instance? BinnedField (:field breakout)))
            (update breakout :field update-binned-field filter-field-map)

            :else
            breakout))
        breakouts))

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a
  relevant query criteria affects the min/max value of the binned
  field. This middleware looks for that criteria, then updates the
  related min/max values and calculates the bin-width based on the
  criteria values (or global min/max information)."
  [qp]
  (fn [query]
    (let [binned-breakouts (filter #(instance? BinnedField %) (get-in query [:query :breakout]))
          binned-order-by  (filter #(instance? BinnedField %) (map :field (get-in query [:query :order-by])))
          filter-field-map (filter->field-map (get-in query [:query :filter]))]
      (qp
       (cond-> query
         (seq binned-breakouts) (update-in [:query :breakout] update-binned-fields filter-field-map)
         (seq binned-order-by) (update-in [:query :order-by] update-binned-fields filter-field-map))))))
