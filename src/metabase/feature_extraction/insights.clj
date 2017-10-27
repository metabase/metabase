(ns metabase.feature-extraction.insights
  "Data insights -- morsels of prepackaged analysis."
  (:require [bigml.histogram.core :as h]
            [distributions.core :as d]
            [kixi.stats.core :as stats]
            [redux.core :as redux]
            [metabase.feature-extraction
             [math :as math]
             [timeseries :as ts]]))

(defmacro ^:private definsight
  [insight docs features & body]
  `(defn ~insight ~docs
     [{:keys ~features}]
     (when-let [insight# (do ~@body)]
       {~(keyword insight) insight#})))

(definsight normal-range
  ""
  [histogram]
  (let [{lower 0.25 upper 0.75} (h/percentiles histogram 0.25 0.75)]
    {:lower lower
     :upper upper}))

(definsight gaps
  ""
  [nil% field]
  (when (pos? nil%)
    {:mode :nils
     :quality (if (< nil% 0.1)
                :some
                :many)
     :filter [[:IS_NULL [:field-id (:id field)]]]}))

(definsight autocorrelation
  "
  Template: Your data has a [strong/mild] autocorrelation at lag [lag]."
  [series]
  (let [{:keys [autocorrelation lag]} (math/autocorrelation (map second series))]
    (when (> autocorrelation 0.3)
      {:quality (if (< autocorrelation 0.6)
                  :weak
                  :strong)
       :lag     lag})))

(definsight noisiness
  ""
  [series resolution]
  (let [saddles% (/ (math/saddles series) (max (count series) 1))]
    (when (> saddles% 0.1)
      {:quality                (if (> saddles% 0.3)
                                 :very
                                 :slightly)
       :recommended-resolution (ts/higher-resolution resolution)})))

(definsight variation-trend
  "
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
                        :s-xx (redux/pre-step + #(Math/pow (first %) 2))
                        :s-y  (redux/pre-step + second)
                        :s-yy (redux/pre-step + #(Math/pow (second %) 2))}))
                     (fn [[{:keys [ss-xy ss-x n]} {:keys [s-x s-xx s-y s-yy]}]]
                       (when (and (> n 2) (not (zero? ss-x)))
                         (let [slope  (/ ss-xy ss-x)
                               error  (* (/ 1
                                            (- n 2)
                                            (- (* n s-xx) (Math/pow s-x 2)))
                                         (- (* n s-yy)
                                            (Math/pow s-y 2)
                                            (* (Math/pow slope 2)
                                               (- (* n s-xx) (Math/pow s-x 2)))))
                               t      (/ slope error)
                               t-crit (-> (d/t-distribution (- n 2))
                                          (d/icdf (- 1 (/ 0.05 2))))]
                           (when (> t t-crit)
                             {:mode (if (pos? slope)
                                      :increasing
                                      :decreasing)})))))))))

(definsight seasonality
  ""
  [seasonal-decomposition]
  (when seasonal-decomposition
    (let [diff (transduce identity stats/mean
                          (map (fn [[_ seasonal] [_ residual]]
                                 (math/growth (Math/abs seasonal)
                                              (Math/abs residual)))
                               (:seasonal seasonal-decomposition)
                               (:residual seasonal-decomposition)))]
      (when (pos? diff)
        {:quality (if (< diff 1)
                    :weak
                    :strong)}))))
