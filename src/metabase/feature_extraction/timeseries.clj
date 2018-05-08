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
             [math :as math]]
            [redux.core :as redux])
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
       (let [xs                           (double-array (map first ts))
             ys                           (double-array (map second ts))
             ^StlDecomposition decomposer (StlDecomposition. period)
             _                            (reduce-kv
                                           (fn [^StlConfig config k v]
                                             (when-let [setter (stl-setters k)]
                                               (setter config v))
                                             config)
                                           (.getConfig decomposer)
                                           (merge {:inner-loop-passes 100}
                                                  opts))
             ^StlResult decomposition     (.decompose decomposer xs ys)]
         {:trend    (map vector xs (.getTrend decomposition))
          :seasonal (map vector xs (.getSeasonal decomposition))
          :residual (map vector xs (.getRemainder decomposition))})))))

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

(extend-protocol Quarter
  java.util.Date
  (quarter [dt]
    (-> dt .getMonth inc (* 0.33) Math/ceil long))

  org.joda.time.DateTime
  (quarter [dt]
    (-> dt t/month (* 0.33) Math/ceil long)))

(def ^:private quartiles
  "Transducer that calculates 1st, 2nd, and 3rd quartile.
   https://en.wikipedia.org/wiki/Quartile"
  (redux/post-complete
   h/histogram
   #(-> % (h.impl/percentiles 0.25 0.5 0.75) vals)))

(def ^:private ^{:arglists '([candidates])} most-likely-breaks
  "Pick out true breaks from among break candidates by selecting the point with
   the highest eta from each group of consecutive points."
  (partial reduce (fn [[head & tail :as breaks] {:keys [idx x eta]}]
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
           []))

(defn breaks
  "Find positions of structural breaks.

   The idea is to slide a window of length 2w+1 across the time series (window
   length is determined based on `resolution`). At each step we calculate the
   eta statistic measuring the difference in distributions of the left [0, w+1]
   and right [w+1, 2w+1] half-window centered at pivot. We normalize eta by the
   range of values in the window to make it impervious to trend shifts in mean
   and variance.
   We then pick out all outlier etas. These are break candidates. However as we
   are using a sliding window there will likely be several candidates for the
   same break (even when the pivot is not perfectly positioned we still expect a
   significant difference between left and right half-window). We select the
   point with the highest eta among consecutive points (this also means we can
   only detect breaks that are more than w apart).

   https://en.wikipedia.org/wiki/Structural_break
   http://journals.plos.org/plosone/article?id=10.1371/journal.pone.0059279#pone.0059279.s003"
  [period series]
  (let [half-period (-> period (/ 2) Math/floor int inc)]
    (->> (map (fn [left right idx]
                (let [pivot  (ffirst right)
                      window (map second (concat left right))
                      range  (- (apply max window) (apply min window))
                      ql     (transduce (map second) quartiles left)
                      qr     (transduce (map second) quartiles right)]
                  {:eta (if (zero? range)
                          0
                          (/ (reduce + (map (comp k.math/sq -) ql qr))
                             3 (k.math/sq range)))
                   :x   pivot
                   :idx idx}))
              ; We want pivot point to be in both halfs, hence the overlap.
              (partition half-period 1 series)
              (partition half-period 1 (drop (dec half-period) series))
              (range))
         (math/outliers :eta)
         most-likely-breaks
         (map :x))))
