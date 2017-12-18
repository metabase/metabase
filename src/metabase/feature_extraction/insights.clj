(ns metabase.feature-extraction.insights
  "Data insights -- morsels of prepackaged analysis."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.math.numeric-tower :as num]
            [jdistlib.core :as d]
            [kixi.stats
             [core :as stats]
             [math :refer [sq]]]
            [metabase.feature-extraction
             [histogram :as h]
             [math :as math]
             [timeseries :as ts]]
            [net.cgrand.xforms :as x]
            [redux.core :as redux]))

(defmacro ^:private definsight
  [insight docs features & body]
  `(defn ~insight ~docs
     [{:keys ~features}]
     (when-let [insight# (do ~@body)]
       {~(keyword insight) insight#})))

(definsight normal-range
  "What is the normal (expected) range for this data?
   We define normal as being within interquartile range.
   https://en.wikipedia.org/wiki/Interquartile_range"
  [q1 q3]
  (when q1
    {:lower q1
     :upper q3}))

(definsight nils
  "Are there any nils in the data?"
  [nil% field count]
  (when (some-> nil% pos?)
    {:quality (if (< nil% (/ (Math/log (inc count))))
                :some
                :many)
     :filter  [:IS_NULL [:field-id (:id field)]]}))

(definsight zeros
  "Are there any 0s in the data?"
  [zero% field count]
  (when (some-> zero% pos?)
    {:quality (if (< zero% (/ (Math/log (inc count))))
                :some
                :many)
     :filter  [:= [:field-id (:id field)] 0]}))

(definsight autocorrelation
  "Is there a significant autocorrelation at lag up to period length?
   https://en.wikipedia.org/wiki/Autocorrelation"
  [autocorrelation]
  (let [{:keys [autocorrelation lag]} autocorrelation]
    (when (some-> autocorrelation (> 0.3))
      {:quality (if (< autocorrelation 0.6)
                  :weak
                  :strong)
       :lag     lag})))

(definsight noisiness
  "Is the data is noisy?
   We determine noisiness by the relatve number of saddles in the series."
  [series resolution]
  (let [saddles% (/ (math/saddles series) (max (count series) 1))]
    (when (> saddles% 0.1)
      {:quality                (if (> saddles% 0.3)
                                 :very
                                 :slightly)
       :recommended-resolution (ts/higher-resolution resolution)})))

(definsight variation-trend
  "Is there a consistent thrend in changes of variation from one period to the
   next?

   We determine the trend by calculating relative variance for each period window
   and fit a linear regression to the resulting sequence of variances. We then
   test the hypothesis that the slope of this regression is not significantly
   different from 0.
   https://en.wikipedia.org/wiki/Simple_linear_regression
   https://msu.edu/course/msc/317/slr-reg.htm
   https://en.wikipedia.org/wiki/Variance"
  [resolution series]
  (when resolution
    (transduce
     (comp (x/partition (ts/period-length resolution)
                        (comp (map second)
                              (x/reduce h/histogram)))
           (map-indexed (fn [idx histogram]
                          [(double idx) (/ (h.impl/variance histogram)
                                           (h.impl/mean histogram))])))
     (redux/post-complete
      (redux/juxt (stats/sum-squares first second)
                  (redux/fuse {:s-x  ((map first) +)
                               :s-xx ((map (comp sq first)) +)
                               :s-y  ((map second) +)
                               :s-yy ((map (comp sq second)) +)}))
      (fn [[{:keys [ss-xy ss-x n]} {:keys [s-x s-xx s-y s-yy]}]]
        (when (and (> n 2) (not-any? zero? [ss-x s-x]))
          (let [slope       (/ ss-xy ss-x)
                slope-error (/ (- (* n s-yy)
                                  (sq s-y)
                                  (* (sq slope)
                                     (- (* n s-xx) (sq s-x))))
                               (- n 2)
                               (- (* n s-xx) (sq s-x)))]
            (when (and (not= slope 0.0)
                       (math/significant? (/ slope slope-error)
                                          (d/t-distribution (- n 2))
                                          (/ 0.05 2)))
              {:mode (if (pos? slope)
                       :increasing
                       :decreasing)})))))
     series)))

(definsight seasonality
  "Is there a seasonal component to the changes in data?

   Presence and strength of seasonal component is determined based on comparison
   with residuals from the STL decomposition.
   https://www.wessa.net/download/stl.pdf"
  [seasonal-decomposition]
  (when seasonal-decomposition
    (let [diff (transduce identity stats/mean
                          (map (fn [[_ seasonal] [_ residual]]
                                 (math/growth (num/abs seasonal)
                                              (num/abs residual)))
                               (:seasonal seasonal-decomposition)
                               (:residual seasonal-decomposition)))]
      (when (pos? diff)
        {:quality (if (< diff 1)
                    :weak
                    :strong)}))))

(definsight multimodal
  "Is the data multimodal?
   https://en.wikipedia.org/wiki/Multimodal_distribution
   http://www.nicprice.net/diptest/Hartigan_1985_AnnalStat.pdf"
  [histogram]
  (-> histogram
      (h.impl/sample 1000)
      d/dip-test
      second
      (< 0.05)))

(definsight structural-breaks
  "Are there any structural breaks in the data?
   https://en.wikipedia.org/wiki/Structural_break"
  [resolution series]
  (when resolution
    (some->> series
             (ts/breaks (ts/period-length resolution))
             sort
             (map ts/from-double)
             not-empty
             (hash-map :breaks))))

(definsight outliers
  "Find outliers using Tukey's fences (1.5*IQR heuristic).
   https://en.wikipedia.org/wiki/Outlier
   https://en.wikipedia.org/wiki/Interquartile_range"
  [histogram field min max]
  (let [{:keys [q1 q3 iqr]} (h/iqr histogram)
        lower-bound         (- q1 (* 1.5 iqr))
        upper-bound         (+ q3 (* 1.5 iqr))]
    (when (or (< min lower-bound)
              (> max upper-bound))
      {:filter [:or [:> [:field-id (:id field)] upper-bound]
                [:< [:field-id (:id field)] lower-bound]]})))

(definsight stationary
  "Is the data stationary.

   We test for stationarity by sliding a winodw  (window length is determined
   based on `resolution`) across the time series and perform the Welch's t-test
   on each adjacent pair of windows. If none of the pair-wise changes are
   determined to be significant, the series is stationary.

   Note: what we are doing is not entierly theoretical sound. We take population
   size n to be equal to window length, neglecting the fact that our points are
   already aggregations of populations of unknown size.
   https://en.wikipedia.org/wiki/Welch%27s_t-test
   https://en.wikipedia.org/wiki/Stationary_process"
  [series resolution]
  (when-let [n (ts/period-length resolution)]
    (transduce (comp (x/partition n  (comp (map second)
                                          (x/reduce h/histogram)))
                     (map (fn [histogram]
                            {:mean (h.impl/mean histogram)
                             :var  (h.impl/variance histogram)}))
                     (x/partition 2 1 (x/into [])))
               (fn
                 ([] true)
                 ([acc] acc)
                 ([_ [{mean1 :mean var1 :var} {mean2 :mean var2 :var}]]
                  (if (= var1 var2 0.0)
                    true
                    (let [t (/ (- mean1 mean2)
                               (num/sqrt (/ (+ var1 var2) n)))
                          k (num/round (/ (sq (/ (+ var1 var2) n))
                                          (/ (+ (sq var1)
                                                (sq var2))
                                             (* n (- n 1)))))]
                      (if (math/significant? t (d/t-distribution k) (/ 0.05 2))
                        (reduced false)
                        true)))))
               series)))

(definsight trend
  "What is the best (simple) trend model?

   We try fitting a linear, power law, and logarithmic models and pick the one
   with the smallest sum of residual squares.
   https://en.wikipedia.org/wiki/Residual_sum_of_squares
   https://en.wikipedia.org/wiki/Simple_linear_regression
   http://mathworld.wolfram.com/LeastSquaresFittingPowerLaw.html
   http://mathworld.wolfram.com/LeastSquaresFittingLogarithmic.html"
  [best-fit]
  {:mode  (if (-> best-fit :params second pos?)
            :growing
            :decreasing)
   :shape ({:linear-regression     :linearly
            :power-law-regression  :exponentally
            :log-linear-regression :logarithmically} (:model best-fit))})
