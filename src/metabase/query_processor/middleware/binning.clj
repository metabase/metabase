(ns metabase.query-processor.middleware.binning
  (:require [clojure.walk :as walk]
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
  (Math/ceil (/ (- max-value min-value)
                bin-width)))

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

(defn- update-bin-width
  "Calculates the bin width given the global min/max and user
  specified crtieria that could impact that min/max. Throws an
  Exception if no min/max values are found."
  [breakouts filter-field-map]
  (mapv (fn [{:keys [field num-bins bin-width] :as breakout}]
          (if (instance? BinnedField breakout)
            (let [[min-value max-value] (extract-bounds field filter-field-map)
                  updated-breakout (assoc breakout :min-value min-value :max-value max-value)]

              (when-not (and min-value max-value)
                (throw (Exception. (format "Unable to bin field '%s' with id '%s' without a min/max value"
                                           (get-in breakout [:field :field-name])
                                           (get-in breakout [:field :field-id])))))
              (case (:strategy updated-breakout)

                :num-bins
                (assoc updated-breakout
                  :bin-width (calculate-bin-width min-value max-value num-bins))

                :bin-width
                (assoc updated-breakout
                  :num-bins (calculate-num-bins min-value max-value bin-width))

                :default
                (resolve-default-strategy updated-breakout)))
            breakouts))
        breakouts))

(defn update-binning-strategy
  "When a binned field is found, it might need to be updated if a
  relevant query criteria affects the min/max value of the binned
  field. This middleware looks for that criteria, then updates the
  related min/max values and calculates the bin-width based on the
  criteria values (or global min/max information)."
  [qp]
  (fn [query]
    (let [binned-breakouts (filter #(instance? BinnedField %) (get-in query [:query :breakout]))]
      (if (seq binned-breakouts)
        (qp (update-in query [:query :breakout] update-bin-width (filter->field-map (get-in query [:query :filter]))))
        (qp query)))))
