(ns metabase.feature-extraction.comparison
  "Feature vector similarity comparison."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.math.numeric-tower :as num]
            [clojure.set :as set]
            [kixi.stats.core :as stats]
            [metabase.feature-extraction
             [feature-extractors :as fe]
             [histogram :as h]
             [math :as math]]
            [redux.core :as redux])
  (:import com.bigml.histogram.Histogram))

(defmulti
  ^{:doc "Difference between two features.
          Confined to [0, 1] with 0 being same, and 1 orthogonal."
    :arglists '([a v])}
  difference #(mapv type %&))

(defmethod difference [Number Number]
  [a b]
  {:difference (cond
                 (== a b)          0
                 (zero? (max a b)) 1
                 :else             (let [a (double a)
                                         b (double b)]
                                     (/ (num/abs (- a b))
                                        2 (max (num/abs a) (num/abs b)))))})

(defmethod difference [Boolean Boolean]
  [a b]
  {:difference (if (= a b) 0 1)})

(defn- comparable-segment
  [a b]
  (loop [[[ax _] & a-rest :as a] a
         [[bx _] & b-rest :as b] b]
    (cond
      (not (and ax bx)) nil
      (= ax bx)         (loop [[[ax ay] & a] a
                               [[bx by] & b] b
                               ays           []
                               bys           []
                               xs            []]
                          (cond
                            (not (and ax bx))
                            [xs ays bys]

                            (= ax bx)
                            (recur a b (conj ays ay) (conj bys by) (conj xs ax))

                            :else nil))
      (> ax bx)         (recur a b-rest)
      (< ax bx)         (recur a-rest b))))

(defmethod difference [clojure.lang.Sequential clojure.lang.Sequential]
  [a b]
  (let [[t a b]    (comparable-segment a b)
        [corr cov] (transduce identity (redux/juxt
                                        (stats/correlation first second)
                                        (stats/covariance first second))
                              (map vector a b))]
    {:correlation  corr
     :covariance   cov
     :significant? (some-> corr num/abs (> 0.3))
     :difference   (or (math/cosine-distance a b) 0.5)
     :deltas       (map (fn [t a b]
                          [t (- a b)])
                        t a b)}))

(defmethod difference [nil Object]
  [a b]
  {:difference nil})

(defmethod difference [Object nil]
  [a b]
  {:difference nil})

(defmethod difference [nil nil]
  [a b]
  {:difference nil})

(defn- unify-categories
  "Given two PMFs add missing categories and align them so they both cover the
   same set of categories."
  [pmf-a pmf-b]
  (let [categories-a (into #{} (map first) pmf-a)
        categories-b (into #{} (map first) pmf-b)]
    [(->> (set/difference categories-b categories-a)
          (map #(vector % 0))
          (concat pmf-a)
          (sort-by first))
     (->> (set/difference categories-a categories-b)
          (map #(vector % 0))
          (concat pmf-b)
          (sort-by first))]))

(defn- chi-squared-critical-value
  [n]
  (+ (* -0.037 (Math/log n)) 0.365))

(defmethod difference [Histogram Histogram]
  [a b]
  (let [[pdf-a pdf-b] (if (h/categorical? a)
                        (unify-categories (h/pdf a) (h/pdf b))
                        (map h/pdf [a b]))
        ;; We are only interested in the shape, hence scale-free comparison
        p             (map second pdf-a)
        q             (map second pdf-b)
        m             (h/count a)
        n             (h/count b)
        distance      (math/chi-squared-distance p q)]
    {:difference       distance
     :significant?     (and (math/ks-test m p n q)
                            (> distance (chi-squared-critical-value (min m n))))
     :top-contributors (when (h/categorical? a)
                         (->> (map (fn [[bin pi] [_ qi]]
                                     [bin (num/abs (- pi qi))])
                                   pdf-a pdf-b)
                              (math/head-tails-breaks second)
                              (map first)))}))

(defn- flatten-map
  ([m] (flatten-map nil m))
  ([prefix m]
   (into {}
     (mapcat (fn [[k v]]
               (let [k (if prefix
                         (keyword (str (name prefix) "_" (name k)))
                         k)]
                 (if (map? v)
                   (flatten-map k v)
                   [[k v]]))))
     m)))

(defn pairwise-differences
  "Pairwise differences of feature vectors `a` and `b`."
  [a b]
  (into {}
    (map (fn [[ka va] [kb vb]]
           (assert (= ka kb) "Incomparable models.")
           [ka (difference va vb)])
         (flatten-map (fe/comparison-vector a))
         (flatten-map (fe/comparison-vector b)))))

(def ^:private ^:const ^Double interestingness-thershold 0.2)

(defn features-distance
  "Distance metric between feature vectors `a` and `b`."
  [a b]
  (let [differences (pairwise-differences a b)]
    {:distance         (transduce (keep (comp :difference val))
                                  (redux/post-complete
                                   math/magnitude
                                   #(/ % (num/sqrt (count differences))))
                                  differences)
     :components       differences
     :top-contributors (->> differences
                            (filter (comp :difference second))
                            (math/head-tails-breaks (comp :difference second)))
     :thereshold       interestingness-thershold
     :significant?     (some :significant? (vals differences))}))
