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

(def ^:private ^:const ^Long pdf-sample-points 100)

(def ^{:arglists '([^Histogram histogram])} categorical?
  "Returns true if given histogram holds categorical values."
  (comp (complement #{:none}) impl/target-type))

(defn pdf
  "Probability density function of given histogram.
   Obtained by sampling density at `pdf-sample-points` points from the histogram
   or at each target if histogram holds categorical data.
   https://en.wikipedia.org/wiki/Probability_density_function"
  [^Histogram histogram]
  (if (categorical? histogram)
    (map (let [norm (/ (impl/total-count histogram))]
           (fn [[target count]]
             [target (* count norm)]))
         (-> histogram impl/bins first :target :counts))
    (let [{:keys [min max]} (impl/bounds histogram)
          step (/ (- max min) pdf-sample-points)]
      (transduce (take pdf-sample-points)
                 (fn
                   ([] {:total-count 0
                        :densities   (transient [])})
                   ([{:keys [total-count densities]}]
                    (for [[x count] (persistent! densities)]
                      [x (/ count total-count)]))
                   ([{:keys [total-count densities]} i]
                    (let [d (impl/density histogram i)]
                      {:densities   (conj! densities [i d])
                       :total-count (+ total-count d)})))
                 (iterate (partial + step) min)))))

(def ^{:arglists '([^Histogram histogram])} nil-count
  "Return number of nil values histogram holds."
  (comp :count impl/missing-bin))

(defn total-count
  "Return total number of values histogram holds."
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
