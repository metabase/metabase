(ns metabase.fingerprinting.comparison
  "Fingerprint similarity comparison."
  (:require [clojure.set :as set]
            [kixi.stats.math :as math]
            [metabase.fingerprinting
             [fingerprinters :as fingerprinters]
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
                (- 1 (/ product magnitude-a magnitude-b))))
             (map vector a b)))

(defmulti
  ^{:doc "Difference between two features.
          Confined to [0, 1] with 0 being same, and 1 orthogonal."
    :arglists '([a v])}
  difference #(mapv type %&))

(defmethod difference [Number Number]
  [a b]
  (cond
    (every? zero? [a b]) 0
    (zero? (max a b))    1
    :else                (/ (- (max a b) (min a b))
                            (max a b))))

(defmethod difference [Boolean Boolean]
  [a b]
  (if (= a b) 0 1))

(defmethod difference [clojure.lang.Sequential clojure.lang.Sequential]
  [a b]
  (* 0.5 (cosine-distance a b)))

(defn chi-squared-distance
  "Chi-squared distane between empirical probability distributions `p` and `q`.
   https://stats.stackexchange.com/questions/184101/comparing-two-histograms-using-chi-square-distance"
  [p q]
  (reduce + (map (fn [pi qi]
                   (if (zero? (+ pi qi))
                     0
                     (/ (math/sq (- pi qi))
                        (+ pi qi))))
                 p q)))

(defn- unify-categories
  "Given two PMFs add missing categories and align them so they both cover the
   same set of categories."
  [pmf-a pmf-b]
  (let [categories-a (into #{} (map first) pmf-a)
        categories-b (into #{} (map first) pmf-b)]
    [(->> (set/difference categories-a categories-b)
          (map #(vector % 0))
          (concat pmf-a)
          (sort-by first))
     (->> (set/difference categories-b categories-a)
          (map #(vector % 0))
          (concat pmf-b)
          (sort-by first))]))

(defmethod difference [Histogram Histogram]
  [a b]
  (let [[pdf-a pdf-b] (if (h/categorical? a)
                        (unify-categories (h/pdf a) (h/pdf b))
                        (map h/pdf [a b]))]
    ;; We are only interested in the shape, hence scale-free comparison
    (chi-squared-distance (map second pdf-a) (map second pdf-b))))

(defn- flatten-map
  ([m] (flatten-map nil m))
  ([prefix m]
   (into {}
     (mapcat (fn [[k v]]
               (let [k (keyword (some-> prefix str (subs 1)) (name k))]
                 (if (map? v)
                   (flatten-map k v)
                   [[k v]]))))
     m)))

(defn pairwise-differences
  "Pairwise differences of (feature) vectors `a` and `b`."
  [a b]
  (into {}
    (map (fn [[k a] [_ b]]
           [k (difference a b)])
         (flatten-map (fingerprinters/comparison-vector a))
         (flatten-map (fingerprinters/comparison-vector b)))))

(def ^:private ^:const ^Double interestingness-thershold 0.2)

(defn fingerprint-distance
  "Distance metric between fingerprints `a` and `b`."
  [a b]
  (let [differences (pairwise-differences a b)]
    {:distance   (transduce (map val)
                            (redux/post-complete
                             magnitude
                             #(/ % (math/sqrt (count differences))))
                            differences)
     :components (sort-by val > differences)
     :thereshold interestingness-thershold}))
