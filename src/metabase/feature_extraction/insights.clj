(ns metabase.feature-extraction.insights
  "Data insights -- morsels of prepackaged analysis."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.math.numeric-tower :as num]
            [distributions.core :as d]
            [jdistlib.core :as d.tests]
            [kixi.stats.core :as stats]
            [metabase.feature-extraction
             [histogram :as h]
             [math :as math]
             [timeseries :as ts]]
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
  (when (pos? nil%)
    {:quality (if (< nil% (/ (Math/log (inc count))))
                :some
                :many)
     :filter  [:IS_NULL [:field-id (:id field)]]}))

(definsight zeros
  "Are there any 0s in the data?"
  [zero% field count]
  (when (pos? zero%)
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
   next.

   We determine the trend by fitting a linear regression and test the hypothesis
   that slope is not significantly different from 0.
   https://en.wikipedia.org/wiki/Simple_linear_regression
   https://msu.edu/course/msc/317/slr-reg.htm
   https://en.wikipedia.org/wiki/Variance"
  [resolution series]
  (when resolution
    (->> series
         (map second)
         (partition (ts/period-length resolution) 1)
         (transduce
          (map-indexed (fn [i xsi]
                         [i (transduce identity
                                       (redux/post-complete
                                        (redux/juxt stats/variance
                                                    stats/mean)
                                        (fn [[var mean]]
                                          (/ var mean)))
                                       xsi)]))
          (redux/post-complete
           (redux/juxt
            (stats/sum-squares first second)
            (redux/fuse
             {:s-x  (redux/pre-step + first)
              :s-xx (redux/pre-step + #(num/expt (first %) 2))
              :s-y  (redux/pre-step + second)
              :s-yy (redux/pre-step + #(num/expt (second %) 2))}))
           (fn [[{:keys [ss-xy ss-x n]} {:keys [s-x s-xx s-y s-yy]}]]
             (when (and (> n 2) (not-any? zero? [ss-x s-x]))
               (let [slope       (/ ss-xy ss-x)
                     slope-error (* (/ 1
                                       (- n 2)
                                       (- (* n s-xx) (num/expt s-x 2)))
                                    (- (* n s-yy)
                                       (num/expt s-y 2)
                                       (* (num/expt slope 2)
                                          (- (* n s-xx) (num/expt s-x 2)))))]
                 (when (math/significant? (if (zero? slope)
                                            0
                                            (/ slope slope-error))
                                          (d/t-distribution (- n 2))
                                          (/ 0.05 2))
                   {:mode (if (pos? slope)
                            :increasing
                            :decreasing)})))))))))

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
      d.tests/dip-test
      second
      (< 0.05)))

(definsight structural-breaks
  "Are there any structural breaks in the data?
   https://en.wikipedia.org/wiki/Structural_break"
  [resolution series]
  (when resolution
    (some->> series
             (ts/breaks (ts/period-length resolution))
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
  (when resolution
    (let [n (ts/period-length resolution)]
      (->> series
           (partition n 1)
           (map (partial transduce (map second)
                         (redux/fuse {:mean stats/mean
                                      :var  stats/variance})))
           (partition 2 1)
           (map (fn [[{mean1 :mean variance1 :var} {mean2 :mean variance2 :var}]]
                  (if (= variance1 variance2 0)
                    false
                    (let [t (/ (- mean1 mean2)
                               (num/sqrt (/ (+ variance1 variance2) n)))
                          k (num/round
                             (/ (num/expt (/ (+ variance1 variance2) n) 2)
                                (/ (+ (num/expt variance1 2)
                                      (num/expt variance2 2))
                                   (* n (- n 1)))))]
                      (math/significant? t (d/t-distribution k) (/ 0.05 2))))))
           (every? false?)))))
