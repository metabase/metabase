(ns metabase.feature-extraction.insights
  "Data insights -- morsels of prepackaged analysis."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.math.numeric-tower :as num]
            [distributions.core :as d]
            [kixi.stats.core :as stats]
            [redux.core :as redux]
            [metabase.feature-extraction
             [histogram :as h]
             [math :as math]
             [timeseries :as ts]])
  ;(:import net.sourceforge.jdistlib.disttest.DistributionTest)
  )

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
  [nil% field]
  (when (pos? nil%)
    {:quality (if (< nil% 0.1)
                :some
                :many)
     :filter  [:IS_NULL [:field-id (:id field)]]}))

(definsight zeros
  "Are there any 0s in the data?"
  [zero% field]
  (when (pos? zero%)
    {:quality (if (< zero% 0.1)
                :some
                :many)
     :filter  [:= [:field-id (:id field)] 0]}))

(definsight autocorrelation
  "Is there a significant autocorrelation at lag up to period length?
   https://en.wikipedia.org/wiki/Autocorrelation"
  [series resolution]
  (let [{:keys [autocorrelation lag]} (math/autocorrelation
                                       {:max-lag (or (some-> resolution
                                                             ts/period-length
                                                             dec)
                                                     (/ (count series) 2))}
                                       (map second series))]
    (when (> autocorrelation 0.3)
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
   https://en.wikipedia.org/wiki/Variance"
  [resolution series]
  (when resolution
    (->> series
         (map second)
         (partition (ts/period-length resolution) 1)
         (transduce (map-indexed (fn [i xsi]
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
                         (let [slope  (/ ss-xy ss-x)
                               error  (* (/ 1
                                            (- n 2)
                                            (- (* n s-xx) (num/expt s-x 2)))
                                         (- (* n s-yy)
                                            (num/expt s-y 2)
                                            (* (num/expt slope 2)
                                               (- (* n s-xx) (num/expt s-x 2)))))
                               t      (if (zero? slope)
                                        0
                                        (/ slope error))
                               t-crit (-> (d/t-distribution (- n 2))
                                          (d/icdf (- 1 (/ 0.05 2))))]
                           (when (> t t-crit)
                             {:mode (if (pos? slope)
                                      :increasing
                                      :decreasing)})))))))))

(definsight seasonality
  "Is there a seasonal component to the changes in data?
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
  ;; (-> histogram
  ;;     (h.impl/sample 1000)
  ;;     double-array
  ;;     DistributionTest/diptest
  ;;     second
  ;;     (< 0.05))
  nil)
