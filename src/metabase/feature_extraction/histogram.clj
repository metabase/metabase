(ns metabase.feature-extraction.histogram
  "Wrappers and additional functionality for `bigml.histogram`."
  (:refer-clojure :exclude [empty?])
  (:require [bigml.histogram.core :as impl]
            [kixi.stats.math :as math]
            [medley.core :as m]
            [metabase.query-processor.middleware.binning :as binning])
  (:import com.bigml.histogram.Histogram))

(defn histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (impl/create))
  ([^Histogram histogram] histogram)
  ([^Histogram histogram x] (impl/insert-simple! histogram x)))

(defn histogram-categorical
  "Transducer that summarizes categorical data with a histogram."
  ([] (impl/create))
  ([^Histogram histogram] histogram)
  ([^Histogram histogram x] (impl/insert-categorical! histogram (when x 1) x)))

(def ^{:arglists '([^Histogram histogram])} categorical?
  "Returns true if given histogram holds categorical values."
  (comp (complement #{:none :unset}) impl/target-type))

(def ^{:arglists '([^Histogram histogram])} empty?
  "Returns true if given histogram holds no (non-nil) values."
  (comp zero? impl/total-count))

(def ^{:arglists '([^Histogram histogram])} nil-count
  "Return number of nil values histogram holds."
  (comp :count impl/missing-bin))

(defn total-count
  "Return total number (including nils) of values histogram holds."
  [^Histogram histogram]
  (+ (impl/total-count histogram)
     (nil-count histogram)))

(defn optimal-bin-width
  "Determine optimal bin width (and consequently number of bins) for a given
   histogram using Freedman-Diaconis rule.
   https://en.wikipedia.org/wiki/Freedman%E2%80%93Diaconis_rule"
  [^Histogram histogram]
  {:pre [(not (categorical? histogram))]}
  (when-not (empty? histogram)
    (let [{first-q 0.25 third-q 0.75} (impl/percentiles histogram 0.25 0.75)]
      (* 2 (- third-q first-q) (math/pow (impl/total-count histogram) (/ -3))))))

(defn equidistant-bins
  "Split histogram into `bin-width` wide bins. If `bin-width` is not given use
   `optimal-bin-width` to calculate optimal width. Optionally takes `min` and
   `max` and projects histogram into that interval rather than hisogram bounds."
  ([^Histogram histogram]
   (if (categorical? histogram)
     (-> histogram impl/bins first :target :counts)
     (equidistant-bins (optimal-bin-width histogram) histogram)))
  ([bin-width ^Histogram histogram]
   (let [{:keys [min max]} (impl/bounds histogram)]
     (equidistant-bins min max bin-width histogram)))
  ([min-value max-value bin-width ^Histogram histogram]
   (when-not (empty? histogram)
     (->> min-value
          (iterate (partial + bin-width))
          (drop 1)
          (m/take-upto (partial <= max-value))
          (map (fn [p]
                 [p (impl/sum histogram p)]))
          (concat [[min-value 0.0]])
          (partition 2 1)
          (map (fn [[[x s1] [_ s2]]]
                 [x (- s2 s1)]))))))

(def ^:private ^:const ^Long pdf-sample-points 100)

(defn pdf
  "Probability density function of given histogram.
   Obtained by sampling density at `pdf-sample-points` points from the histogram
   or at each target if histogram holds categorical data.
   https://en.wikipedia.org/wiki/Probability_density_function"
  [^Histogram histogram]
  (when-not (empty? histogram)
    (let [norm (/ (impl/total-count histogram))
          bins (if (categorical? histogram)
                 (equidistant-bins histogram)
                 (let [{:keys [min max]} (impl/bounds histogram)]
                   (equidistant-bins min max (binning/calculate-bin-width
                                              min
                                              max
                                              pdf-sample-points)
                                     histogram)))]
      (for [[bin count] bins]
        [bin (* count norm)]))))

(defn entropy
  "Calculate (Shannon) entropy of given histogram.
   https://en.wikipedia.org/wiki/Entropy_(information_theory)"
  [^Histogram histogram]
  (- (transduce (comp (map second)
                      (remove zero?)
                      (map #(* % (math/log %))))
                +
                0.0
                (pdf histogram))))
