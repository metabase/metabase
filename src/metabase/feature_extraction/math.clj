(ns metabase.feature-extraction.math
  "Math functions and utilities."
  (:require [distributions.core :as d]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [metabase.feature-extraction.histogram :as h]
            [redux.core :as redux]))

(defn safe-divide
  "Like `clojure.core//`, but returns nil if denominator is 0."
  [x & denominators]
  (when (or (and (not-empty denominators) (not-any? zero? denominators))
            (and (not (zero? x)) (empty? denominators)))
    (apply / x denominators)))

(defn growth
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (and x1 x2 (not (zero? x1)))
    (let [x2 (double x2)
          x1 (double x1)]
      (cond
        (every? neg? [x1 x2])     (growth (- x1) (- x2))
        (and (neg? x1) (pos? x2)) (- (growth x1 x2))
        (neg? x1)                 (- (growth x2 x1))
        :else                     (/ (- x2 x1) x1)))))

(defn saddles
  "Returns the number of saddles in a given series."
  [series]
  (->> series
       (partition 2 1)
       (partition-by (fn [[[_ y1] [_ y2]]]
                       (>= y2 y1)))
       rest
       count))

(defn roughly=
  "Is `x` èqual to `y` within precision `precision` (default 0.05)."
  ([x y] (roughly= x y 0.05))
  ([x y precision]
   (<= (* (- 1 precision) x) y (* (+ 1 precision) x))))

(defn significant?
  "Is `x` significant at `significance-level` if drawn from distribution
   `distribution`."
  ([x distribution] (significant? x distribution 0.95))
  ([x distribution significance-level]
   (> (math/abs x) (d/icdf distribution (- 1 significance-level)))))

(defn autocorrelation
  "Calculate autocorrelation at lag `lag` or find the lag with the highest
   significant autocorrelation (if it exists) up to `max-lag` if `lag` is not
   given.
   https://en.wikipedia.org/wiki/Autocorrelation
   http://sfb649.wiwi.hu-berlin.de/fedc_homepage/xplore/tutorials/xegbohtmlnode39.html"
  ([xs] (autocorrelation {:max-lag (Math/floor (/ (count xs) 2))} xs))
  ([{:keys [lag max-lag]} xs]
   {:pre [(or lag max-lag)]}
   (if lag
     (transduce identity (stats/correlation first second)
                (map vector xs (drop lag xs)))
     (let [n (count xs)]
       (reduce (fn [best lag]
                 (let [r (autocorrelation {:lag lag} xs)]
                   (if (and (some-> r
                                    (* (math/sqrt (- n lag)))
                                    (significant? (d/normal 0 1) (/ 0.05 2)))
                            (> (math/abs r) (math/abs (:autocorrelation best 0))))
                     {:autocorrelation r
                      :lag             lag}
                     best)))
               nil
               (range 1 (inc max-lag)))))))

(defn ssr
  "Transducer that calculates residual sum of squares.
   https://en.wikipedia.org/wiki/Residual_sum_of_squares"
  [model]
  (redux/pre-step + (fn [[x y]]
                      (math/sq (- y (model x))))))

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
                (some->> (safe-divide product magnitude-a magnitude-b) (- 1))))
             (map (comp (partial map double) vector) a b)))

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
   (when-not (zero? (* m n))
     (let [D (apply max (map (comp math/abs -) (pdf->cdf p) (pdf->cdf q)))
           c (math/sqrt (* -0.5 (Math/log (/ significance-level 2))))]
       (> D (* c (math/sqrt (/ (+ m n) (* m n)))))))))

(defn outliers
  "Find outliers using Tukey's fences (1.5*IQR heuristic).
   https://en.wikipedia.org/wiki/Outlier
   https://en.wikipedia.org/wiki/Interquartile_range"
  ([xs] (outliers identity xs))
  ([keyfn xs]
   (let [{:keys [q1 q3 iqr]} (->> xs (transduce (map keyfn) h/histogram) h/iqr)
         lower-bound         (- q1 (* 1.5 iqr))
         upper-bound         (+ q3 (* 1.5 iqr))]
     (remove (comp #(< lower-bound % upper-bound) keyfn) xs))))
