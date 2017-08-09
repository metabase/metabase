(ns metabase.fingerprinting.stl
  "Seasonal-Trend Decomposition
  https://www.wessa.net/download/stl.pdf"
  (:import (com.github.brandtg.stl StlDecomposition StlResult StlConfig)))

(def ^:private setters
  {:inner-loop-passes           (memfn ^StlConfig setNumberOfInnerLoopPasses n)
   :robustness-iterations       (memfn ^StlConfig setNumberOfRobustnessIterations n)
   :trend-bandwidth             (memfn ^StlConfig setTrendComponentBandwidth bw)
   :seasonal-bandwidth          (memfn ^StlConfig setSeasonalComponentBandwidth bw)
   :loess-robustness-iterations (memfn ^StlConfig setLoessRobustnessIterations n)
   :periodic?                   (memfn ^StlConfig setPeriodic periodic?)})

(defn decompose
  "Decompose time series into trend, seasonal component, and residual."
  ([period ts]
   (decompose period {} ts))
  ([period opts ts]
   (let [xs          (map first ts)
         ys          (map second ts)
         preprocess  (if-let [transform (:transform opts)]
                       (partial map transform)
                       identity)
         postprocess (if-let [transform (:reverse-transform opts)]
                       (partial map transform)
                       vec)]
     (transduce identity
                (let [^StlDecomposition decomposer (StlDecomposition. period)]
                  (fn
                    ([] (.getConfig decomposer))
                    ([_]
                     (let [^StlResult decomposition (.decompose
                                                     decomposer
                                                     (double-array xs)
                                                     (double-array (preprocess ys)))]
                       {:trend    (postprocess (.getTrend decomposition))
                        :seasonal (postprocess (.getSeasonal decomposition))
                        :residual (postprocess (.getRemainder decomposition))
                        :xs       xs
                        :ys       ys}))
                    ([^StlConfig config [k v]]
                     (when-let [setter (setters k)]
                       (setter config v))
                     config)))
                (merge {:inner-loop-passes 100}
                       opts)))))
