(ns metabase.fingerprinting.stl
  "Seasonal-Trend Decomposition
  https://www.wessa.net/download/stl.pdf"
  (:import com.github.brandtg.stl.StlDecomposition))

(def ^:private setters
  {:inner-loop-passes           (memfn setNumberOfInnerLoopPasses n)
   :robustness-iterations       (memfn setNumberOfRobustnessIterations n)
   :trend-bandwidth             (memfn setTrendComponentBandwidth bw)
   :seasonal-bandwidth          (memfn setSeasonalComponentBandwidth bw)
   :loess-robustness-iterations (memfn setLoessRobustnessIterations n)
   :periodic?                   (memfn setPeriodic periodic?)})

(defn decompose
  "Decompose time series into trend, seasonal component, and residual."
  ([period ts]
   (decompose period {} ts))
  ([period opts ts]
   (let [xs            (map first ts)
         ys            (map second ts)
         preprocess    (if-let [transform (:transform opts)]
                         (partial map transform)
                         identity)
         postprocess   (if-let [transform (:reverse-transform opts)]
                         (partial map transform)
                         vec)
         decomposer    (StlDecomposition. period)
         _             (reduce-kv (fn [config k v]
                                    (when-let [setter (setters k)]
                                      (setter config v))
                                    config)
                                  (.getConfig decomposer)
                                  (merge {:inner-loop-passes 100}
                                         opts))
         decomposition (.decompose decomposer xs (preprocess ys))]
     {:trend    (postprocess (.getTrend decomposition))
      :seasonal (postprocess (.getSeasonal decomposition))
      :residual (postprocess (.getRemainder decomposition))
      :xs       xs
      :ys       ys})))
