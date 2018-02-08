(ns metabase.feature-extraction.histogram
  "Wrappers and additional functionality for `bigml.histogram`."
  (:refer-clojure :exclude [empty? count])
  (:require [bigml.histogram.core :as impl]
            [kixi.stats.math :as math]
            [medley.core :as m]
            [metabase.query-processor.middleware.binning :as binning])
  (:import com.bigml.histogram.Histogram))

(defn histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (impl/create))
  ([^Histogram h] h)
  ([^Histogram h x] (impl/insert-simple! h x)))

(defn map->histogram
  "Transducer that summarizes preaggregated numerical data with a histogram."
  [fbin fcount]
  (fn
    ([] (impl/create))
    ([^Histogram h] h)
    ([^Histogram h e]
     (impl/insert-bin! h {:mean  (fbin e)
                          :count (-> e fcount double)}))))

(defn map->histogram-categorical
  "Transducer that summarizes preaggregated categorical data with a histogram."
  [fbin fcount]
  (fn
    ([] (impl/create :group-types [:categorical]))
    ([^Histogram h] h)
    ([^Histogram h e]
     (let [[bin count] ((juxt fbin (comp double fcount)) e)]
       (impl/insert-bin! h (if bin
                             {:mean   count
                              :count  1
                              :target {:counts        {bin count}
                                       :missing-count 0.0}}
                             {:count  count
                              :target {:counts {}
                                       :missing-count count}}))))))

(defn histogram-categorical
  "Transducer that summarizes categorical data with a histogram."
  ([] (impl/create))
  ([^Histogram h]
   ;; The histogram implementation we are using is primarily geared towards
   ;; numerical values. When summarizing a distribution of categories all get
   ;; keyed to one number (1 in our case). For consistency sake, and becouse we
   ;; want to retain numerical summarization capabilites, we recast the resulting
   ;; histogram as a preaggregation.
   (-> h
       impl/bins
       first
       :target
       :counts
       (->> (transduce identity (map->histogram-categorical key val)))
       (impl/insert-bin! (impl/missing-bin h))))
  ([^Histogram h x] (impl/insert-categorical! h (when x 1) x)))

(def ^{:arglists '([^Histogram h])} categorical?
  "Returns true if given histogram holds categorical values."
  (comp (complement #{:none :unset}) impl/target-type))

(def ^{:arglists '([^Histogram h])} empty?
  "Returns true if given histogram holds no (non-nil) values."
  (comp zero? impl/total-count))

(defn iqr
  "Return interquartile range for a given histogram.
   https://en.wikipedia.org/wiki/Interquartile_range"
  [^Histogram h]
  (when-not (empty? h)
    (let [{q1 0.25 q3 0.75} (impl/percentiles h 0.25 0.75)]
      {:iqr (- q3 q1)
       :q1  q1
       :q3  q3})))

(defn optimal-bin-width
  "Determine optimal bin width (and consequently number of bins) for a given
   histogram using Freedman-Diaconis rule.
   https://en.wikipedia.org/wiki/Freedman%E2%80%93Diaconis_rule"
  [^Histogram h]
  {:pre [(not (categorical? h))]}
  (some-> h
          iqr
          :iqr
          (* 2 (math/pow (impl/total-count h)
                         (/ -3)))))

(defn bins
  "Split histogram into `bin-width` wide bins. If `bin-width` is not given use
   `optimal-bin-width` to calculate optimal width. Optionally takes `min` and
   `max` and projects histogram into that interval rather than histogram bounds."
  ([^Histogram h]
   (if (categorical? h)
     (into {}
       (mapcat (comp :counts :target))
       (impl/bins h))
     (bins (optimal-bin-width h) h)))
  ([bin-width ^Histogram h]
   (let [{:keys [min max]} (impl/bounds h)]
     (bins min max bin-width h)))
  ([min-value max-value bin-width ^Histogram h]
   (when-not (empty? h)
     (->> min-value
          (iterate (partial + bin-width))
          (drop 1)
          (m/take-upto (partial <= max-value))
          (map (fn [p]
                 [p (impl/sum h p)]))
          (concat [[min-value 0.0]])
          (partition 2 1)
          (map (fn [[[x s1] [_ s2]]]
                 [x (- s2 s1)]))))))

(def ^{:arglists '([^Histogram h])} nil-count
  "Return number of nil values histogram holds."
  (comp :count impl/missing-bin))

(defn count
  "Return the number of non-nil values histogram holds."
  [^Histogram h]
  (if (categorical? h)
    (transduce (map val) + (bins h))
    (impl/total-count h)))

(defn total-count
  "Return total number (including nils) of values histogram holds."
  [^Histogram h]
  (+ (count h)
     (nil-count h)))

(def ^:private ^:const ^Long pdf-sample-points 100)

(defn pdf
  "Probability density function of given histogram.
   Obtained by sampling density at `pdf-sample-points` points from the histogram
   or at each target if histogram holds categorical data.
   https://en.wikipedia.org/wiki/Probability_density_function"
  [^Histogram h]
  (when-not (empty? h)
    (let [norm (/ (count h))
          bins (if (categorical? h)
                 (bins h)
                 (let [{:keys [min max]} (impl/bounds h)]
                   (bins min max (binning/calculate-bin-width
                                              min
                                              max
                                              pdf-sample-points)
                                     h)))]
      (for [[bin count] bins]
        [bin (* count norm)]))))

(defn entropy
  "Calculate (Shannon) entropy of given histogram.
   https://en.wikipedia.org/wiki/Entropy_(information_theory)"
  [^Histogram h]
  (- (transduce (comp (map second)
                      (remove zero?)
                      (map #(* % (math/log %))))
                +
                0.0
                (pdf h))))
