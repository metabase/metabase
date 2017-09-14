(ns metabase.feature-extraction.comparison
  "Feature vector similarity comparison."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.set :as set]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [metabase.feature-extraction
             [feature-extractors :as fe]
             [histogram :as h]]
            [redux.core :as redux])
  (:import com.bigml.histogram.Histogram))

(def magnitude
  "Transducer that claclulates magnitude (Euclidean norm) of given vector.
   https://en.wikipedia.org/wiki/Euclidean_distance"
  (redux/post-complete (redux/pre-step + math/sq) math/sqrt))

(defn cosine-distance
  "Cosine distance between vectors `a` and `b`.
   https://en.wikipedia.org/wiki/Cosine_similarity"
  [a b]
  (transduce identity
             (redux/post-complete
              (redux/fuse {:magnitude-a (redux/pre-step magnitude first)
                           :magnitude-b (redux/pre-step magnitude second)
                           :product     (redux/pre-step + (partial apply *))})
              (fn [{:keys [magnitude-a magnitude-b product]}]
                (some->> (fe/safe-divide product magnitude-a magnitude-b)
                         (- 1))))
             (map vector a b)))

(defn head-tails-breaks
  "Pick out the cluster of N largest elements.
   https://en.wikipedia.org/wiki/Head/tail_Breaks"
  ([keyfn xs] (head-tails-breaks 0.6 keyfn xs))
  ([threshold keyfn xs]
   (let [mean (transduce (map keyfn) stats/mean xs)
         head (filter (comp (partial < mean) keyfn) xs)]
     (cond
       (empty? head)                 xs
       (>= threshold (/ (count head)
                        (count xs))) (recur threshold keyfn head)
       :else                         head))))

(defmulti
  ^{:doc "Difference between two features.
          Confined to [0, 1] with 0 being same, and 1 orthogonal."
    :arglists '([a v])}
  difference #(mapv type %&))

(defmethod difference [Number Number]
  [a b]
  {:difference (cond
                 (== a b 0)        0
                 (zero? (max a b)) 1
                 :else             (/ (- (max a b) (min a b))
                                      (max (math/abs a) (math/abs b))))})

(defmethod difference [Boolean Boolean]
  [a b]
  {:difference (if (= a b) 0 1)})

(defmethod difference [clojure.lang.Sequential clojure.lang.Sequential]
  [a b]
  {:difference (* 0.5 (cosine-distance a b))})

(defmethod difference [nil Object]
  [a b]
  {:difference 1})

(defmethod difference [Object nil]
  [a b]
  {:difference 1})

(defn chi-squared-distance
  "Chi-squared distane between empirical probability distributions `p` and `q`.
   http://www.aip.de/groups/soe/local/numres/bookcpdf/c14-3.pdf"
  [p q]
  (/ (reduce + (map (fn [pi qi]
                      (cond
                        (zero? pi) qi
                        (zero? qi) pi
                        :else      (/ (math/sq (- pi qi))
                                      (+ pi qi))))
                    p q))
     2))

(def ^:private ^{:arglists '([pdf])} pdf->cdf
  (partial reductions +))

(defn ks-test
  "Perform the Kolmogorov-Smirnov test.
   Takes two samples parametrized by size (`m`, `n`) and distribution (`p`, `q`)
   and returns true if the samples are statistically significantly different.
   Optionally takes an additional `significance-level` parameter.
   https://en.wikipedia.org/wiki/Kolmogorov%E2%80%93Smirnov_test"
  ([m p n q] (ks-test 0.95 m p n q))
  ([significance-level m p n q]
   (let [D (apply max (map (comp math/abs -) (pdf->cdf p) (pdf->cdf q)))
         c (math/sqrt (* -0.5 (Math/log (/ significance-level 2))))]
     (> D (* c (math/sqrt (/ (+ m n) (* m n))))))))

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

(chi-squared-critical-value 100)

(defmethod difference [Histogram Histogram]
  [a b]
  (let [[pdf-a pdf-b] (if (h/categorical? a)
                        (unify-categories (h/pdf a) (h/pdf b))
                        (map h/pdf [a b]))
        ;; We are only interested in the shape, hence scale-free comparison
        p             (map second pdf-a)
        q             (map second pdf-b)
        m             (h.impl/total-count a)
        n             (h.impl/total-count b)
        distance      (chi-squared-distance p q)]
    {:difference       distance
     :significant?     (and (ks-test m p n q)
                            (> distance (chi-squared-critical-value (min m n))))
     :top-contributors (when (h/categorical? a)
                         (->> (map (fn [[bin pi] [_ qi]]
                                     [bin (math/abs (- pi qi))])
                                   pdf-a pdf-b)
                              (head-tails-breaks second)
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
    (map (fn [[k a] [_ b]]
           [k (difference a b)])
         (flatten-map (fe/comparison-vector a))
         (flatten-map (fe/comparison-vector b)))))

(def ^:private ^:const ^Double interestingness-thershold 0.2)

(defn features-distance
  "Distance metric between feature vectors `a` and `b`."
  [a b]
  (let [differences (pairwise-differences a b)]
    {:distance         (transduce (map (comp :difference val))
                                  (redux/post-complete
                                   magnitude
                                   #(/ % (math/sqrt (count differences))))
                                  differences)
     :components       differences
     :top-contributors (head-tails-breaks (comp :difference second) differences)
     :thereshold       interestingness-thershold
     :significant?     (some :significant? (vals differences))}))
