(ns metabase.fingerprinting.histogram
  "Wrappers and additional functionality for `bigml.histogram`."
  (:require [bigml.histogram.core :as impl]
            [kixi.stats.math :as math]
            [redux.core :as redux])
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

(def ^:private ^:const ^Long pdf-sample-points 100)

(defn pdf
  "Probability density function of given histogram.
   Obtained by sampling density at `pdf-sample-points` points from the histogram
   or at each target if histogram holds categorical data.
   https://en.wikipedia.org/wiki/Probability_density_function"
  [^Histogram histogram]
  (if (categorical? histogram)
    (let [norm (/ (impl/total-count histogram))]
      (for [[target count] (-> histogram impl/bins first :target :counts)]
        [target (* count norm)]))
    (let [{:keys [min max]} (impl/bounds histogram)]
      (cond
        (nil? min)  []
        (= min max) [[min 1.0]]
        :else       (let [step (/ (- max min) pdf-sample-points)]
                      (transduce (take pdf-sample-points)
                                 (fn
                                   ([] {:total-density 0
                                        :densities     (transient [])})
                                   ([{:keys [total-density densities]}]
                                    (for [[x density] (persistent! densities)]
                                      [x (/ density total-density)]))
                                   ([acc x]
                                    (let [d (impl/density histogram x)]
                                      (-> acc
                                          (update :densities conj! [x d])
                                          (update :total-density + d)))))
                                 (iterate (partial + step) min)))))))

(def ^{:arglists '([^Histogram histogram])} nil-count
  "Return number of nil values histogram holds."
  (comp :count impl/missing-bin))

(defn total-count
  "Return total number (including nils) of values histogram holds."
  [^Histogram histogram]
  (+ (impl/total-count histogram)
     (nil-count histogram)))

(defn entropy
  "Calculate (Shannon) entropy of given histogram.
   https://en.wikipedia.org/wiki/Entropy_(information_theory)"
  [^Histogram histogram]
  (transduce (comp (map second)
                   (remove zero?)
                   (map #(* % (math/log %))))
             (redux/post-complete + -)
             (pdf histogram)))

(defn optimal-bin-width
  "Determine optimal bin width (and consequently number of bins) for a given
   histogram using Freedman-Diaconis rule.
   https://en.wikipedia.org/wiki/Freedman%E2%80%93Diaconis_rule"
  [^Histogram histogram]
  (let [{first-q 0.25 third-q 0.75} (impl/percentiles histogram 0.25 0.75)]
    (when first-q
      (* 2 (- third-q first-q) (math/pow (impl/total-count histogram) (/ -3))))))
