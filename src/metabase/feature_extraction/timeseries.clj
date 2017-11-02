(ns metabase.feature-extraction.timeseries
  "Timeseries analysis and utilities."
  (:require [bigml.histogram.core :as h.impl]
            [clj-time
             [coerce :as t.coerce]
             [core :as t]
             [periodic :as t.periodic]]
            [kixi.stats
             [core :refer [somef] :as stast]
             [math :as k.math]]
            [metabase.feature-extraction
             [histogram :as h]
             [math :as math]])
  (:import (com.github.brandtg.stl StlDecomposition StlResult StlConfig)))

(def ^{:arglists '([t])} to-double
  "Coerce `DateTime` to `Double`."
  (comp double t.coerce/to-long))

(def ^{:arglists '([t])} from-double
  "Coerce `Double` into a `DateTime`."
  (somef (comp t.coerce/from-long long)))

(defn fill-timeseries
  "Given a coll of `[DateTime, Num]` pairs evenly spaced `step` apart, fill
   missing points with 0."
  [resolution ts]
  (let [[step rounder] (case resolution
                         :month   [(t/months 1) t/month]
                         :quarter [(t/months 3) t/month]
                         :year    [(t/years 1) t/year]
                         :week    [(t/weeks 1) t/day]
                         :day     [(t/days 1) t/day]
                         :hour    [(t/hours 1) t/day]
                         :minute  [(t/minutes 1) t/minute])
        ts             (for [[x y] ts]
                         [(-> x from-double (t/floor rounder)) y])
        ts-index       (into {} ts)]
    (into []
      (comp (take-while (partial (complement t/before?) (-> ts last first)))
            (map (fn [t]
                   [(to-double t) (or (ts-index t) 0)])))
      (some-> ts
              ffirst
              (t.periodic/periodic-seq step)))))

(def period-length
  "What is the period for a given time resolution."
  {:hour         24
   :minute       60
   :month        12
   :week         52
   :quarter      4
   :day          365})

(def ^:private stl-setters
  {:inner-loop-passes           (memfn ^StlConfig setNumberOfInnerLoopPasses n)
   :robustness-iterations       (memfn ^StlConfig setNumberOfRobustnessIterations n)
   :trend-bandwidth             (memfn ^StlConfig setTrendComponentBandwidth bw)
   :seasonal-bandwidth          (memfn ^StlConfig setSeasonalComponentBandwidth bw)
   :loess-robustness-iterations (memfn ^StlConfig setLoessRobustnessIterations n)
   :periodic?                   (memfn ^StlConfig setPeriodic periodic?)})

(defn decompose
  "Decompose given timeseries with expected periodicty `period` into trend,
   seasonal component, and residual.
   `period` can be one of `:hour`, `:day`, `:week`, `:quarter` `:minute`,
   `:month`, or `:year`.
   https://www.wessa.net/download/stl.pdf"
  ([period ts]
   (decompose period {} ts))
  ([period opts ts]
   (when-let [period (period-length period)]
     (when (>= (count ts) (* 2 period))
       (let [xs (double-array (map first ts))
             ys (double-array (map second ts))]
         (transduce
          identity
          (let [^StlDecomposition decomposer (StlDecomposition. period)]
            (fn
              ([] (.getConfig decomposer))
              ([_]
               (let [^StlResult decomposition (.decompose decomposer xs ys)]
                 {:trend    (map vector xs (.getTrend decomposition))
                  :seasonal (map vector xs (.getSeasonal decomposition))
                  :residual (map vector xs (.getRemainder decomposition))}))
              ([^StlConfig config [k v]]
               (when-let [setter (stl-setters k)]
                 (setter config v))
               config)))
          (merge {:inner-loop-passes 100}
                 opts)))))))

(def ^:private resolutions [:minute :hour :day :week :month :quarter :year])

(defn lower-resolution
  "Return on size bigger time resolution (eg. minute->hour, day->week, ...)."
  [resolution]
  (->> resolutions (take-while (complement #{resolution})) last))

(defn higher-resolution
  "Return on size smaller time resolution (eg. hour->minute, month->week, ...)."
  [resolution]
  (->> resolutions (drop-while (complement #{resolution})) second))

(defprotocol Quarter
  "Quarter-of-year functionality"
  (quarter [dt] "Return which quarter (1-4) given date-like object falls into."))

(extend-type java.util.Date
  Quarter
  (quarter [dt]
    (-> dt .getMonth inc (* 0.33) Math/ceil long)))

(extend-type org.joda.time.DateTime
  Quarter
  (quarter [dt]
    (-> dt t/month (* 0.33) Math/ceil long)))

(defn breaks
  "Find positions of structural breaks.
   https://en.wikipedia.org/wiki/Structural_break
   http://journals.plos.org/plosone/article?id=10.1371/journal.pone.0059279#pone.0059279.s003"
  [period series]
  (let [half-period (-> period (/ 2) Math/floor int inc)
        q           (fn [window]
                      (-> (transduce (map second) h/histogram window)
                          (h.impl/percentiles 0.25 0.5 0.75)
                          vals))]
    (->> (map (fn [left right idx]
                (let [x      (ffirst right)
                      window (map second (concat left right))
                      range  (- (apply max window) (apply min window))
                      ql     (q left)
                      qr     (q right)]
                  {:eta (/ (reduce + (map (comp k.math/sq -) ql qr))
                           3 (k.math/sq range))
                   :x   x
                   :idx idx}))
              (partition half-period 1 series)
              (partition half-period 1 (drop (dec half-period) series))
              (range))
         (math/outliers :eta)
         (reduce (fn [[head & tail :as breaks] {:keys [idx x eta]}]
                   (if (some-> head :idx inc (= idx))
                     (concat [(if (> (:eta head) eta)
                                (update head :idx inc)
                                {:idx idx
                                 :x   x
                                 :eta eta})]
                             tail)
                     (concat [{:idx idx
                               :x   x
                               :eta eta}]
                             breaks)))
                 [])
         (map :x))))
