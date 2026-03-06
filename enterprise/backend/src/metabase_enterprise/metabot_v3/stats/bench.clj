(ns metabase-enterprise.metabot-v3.stats.bench
  "Benchmarking utilities for chart statistics computation.

  REPL usage:
    (require '[metabase-enterprise.metabot-v3.stats.bench :as bench])

    ;; Generate a chart config for testing
    (def cfg (bench/generate-chart-config {:n-series 3 :n-points 100}))

    ;; Load a chart config from disk
    (def cfg (bench/load-chart-config \"./chart_config_input.json\"))

    ;; Quick benchmark with generated data
    (bench/quick-bench 1000 5)  ; 1000 points, 5 series

    ;; Benchmark with a loaded config
    (bench/bench-config cfg)
    (bench/bench-config cfg {:deep? true})

    ;; Test the full pipeline and see the markdown output
    (println (bench/analyze-chart-output cfg))
    (println (bench/analyze-chart-output cfg {:deep? true}))

    ;; Benchmark and save output to disk
    (bench/bench-and-save cfg :deep? true)
    (bench/bench-and-save cfg :deep? true :filename \"my-test.md\")"
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.metabot-v3.stats.core :as stats.core]
   [metabase-enterprise.metabot-v3.stats.repr :as stats.repr]
   [metabase-enterprise.metabot-v3.tools.analyze-chart :as analyze-chart]
   [metabase.util.json :as json])
  (:import
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Data Generation --------------------------------------------------

(def ^:private series-names
  "Default series names for generated data."
  ["Alpha" "Beta" "Gamma" "Delta" "Epsilon" "Zeta" "Eta" "Theta" "Iota" "Kappa"])

(defn- generate-timestamps
  "Generate a sequence of ISO datetime strings.
  Starts from 2022-01-01 with monthly intervals."
  [n]
  (let [start (LocalDateTime/of 2022 1 1 0 0 0)
        formatter (DateTimeFormatter/ISO_DATE_TIME)]
    (mapv (fn [i]
            (.format (.plusMonths start i) formatter))
          (range n))))

(defn- generate-values
  "Generate numeric values with optional pattern.

  Options:
    :pattern - :random (default), :linear, :volatile, :seasonal
    :base    - starting value (default 100)
    :scale   - value range multiplier (default 1.0)"
  [n {:keys [pattern base scale]
      :or {pattern :random base 100 scale 1.0}}]
  (let [rand-fn #(* scale (+ base (* 50 (- (rand) 0.5))))]
    (case pattern
      :linear
      (mapv (fn [i] (+ base (* scale i))) (range n))

      :volatile
      (mapv (fn [_] (+ base (* scale 100 (- (rand) 0.5)))) (range n))

      :seasonal
      (mapv (fn [i]
              (+ base
                 (* scale 30 (Math/sin (/ (* 2 Math/PI i) 12)))
                 (* scale 10 (- (rand) 0.5))))
            (range n))

      ;; :random - gentle random walk
      (loop [i 0
             prev base
             acc []]
        (if (>= i n)
          acc
          (let [change (* scale 10 (- (rand) 0.5))
                next-val (max 0 (+ prev change))]
            (recur (inc i) next-val (conj acc next-val))))))))

(defn generate-series
  "Generate a single series configuration.

  Options:
    :name      - series name (default \"Series\")
    :n-points  - number of data points (default 50)
    :pattern   - :random, :linear, :volatile, :seasonal (default :random)
    :base      - starting value (default 100)
    :scale     - value multiplier (default 1.0)"
  ([] (generate-series {}))
  ([{:keys [name n-points pattern base scale]
     :or {name "Series" n-points 50 pattern :random base 100 scale 1.0}}]
   (let [timestamps (generate-timestamps n-points)
         values (generate-values n-points {:pattern pattern :base base :scale scale})]
     {:x {:name "timestamp" :type "datetime"}
      :y {:name "value" :type "number"}
      :x_values timestamps
      :y_values values
      :display_name name
      :chart_type "line"
      :stacked false})))

(defn generate-chart-config
  "Generate a complete chart configuration for testing.

  Options:
    :n-series  - number of series (default 1)
    :n-points  - data points per series (default 50)
    :pattern   - value pattern for all series (default :random)
    :title     - chart title (default nil)
    :timeline-events - vector of timeline events (default [])"
  ([] (generate-chart-config {}))
  ([{:keys [n-series n-points pattern title timeline-events]
     :or {n-series 1 n-points 50 pattern :random timeline-events []}}]
   (let [names (take n-series series-names)
         series (into {}
                      (map-indexed
                       (fn [idx series-name]
                         [series-name
                          (generate-series {:name series-name
                                            :n-points n-points
                                            :pattern pattern
                                            :base (+ 80 (* 20 idx))
                                            :scale (+ 0.8 (* 0.4 (rand)))})])
                       names))]
     {:series series
      :timeline_events timeline-events
      :display_type "line"
      :title title})))

;;; ----------------------------------------------- Loading from Disk -------------------------------------------------

(defn load-chart-config
  "Load a chart configuration from a JSON file.

  The file should contain a chart_config object matching the expected schema:
    {\"series\": {...}, \"display_type\": \"line\", ...}

  Returns the parsed chart config map with keyword keys."
  [path]
  (let [file (io/file path)]
    (when-not (.exists file)
      (throw (ex-info (str "Chart config file not found: " path) {:path path})))
    (-> (slurp file)
        (json/decode+kw))))

(defn- count-points
  "Count total data points across all series in a chart config."
  [chart-config]
  (reduce + (for [[_ series] (:series chart-config)]
              (count (:y_values series)))))

;;; --------------------------------------------------- Utilities -----------------------------------------------------

(defn analyze-chart-output
  "Run the full analyze-chart pipeline and return the markdown output.

  Arguments:
    chart-config - a chart configuration map (from generate-chart-config)
    opts         - optional map with :deep? boolean"
  ([chart-config]
   (analyze-chart-output chart-config {}))
  ([chart-config {:keys [deep?] :or {deep? false}}]
   (let [result (analyze-chart/analyze-chart {:chart-config chart-config
                                              :deep deep?})]
     (:output result))))

(defn compute-stats
  "Compute chart statistics without generating representation.
  Useful for inspecting the raw stats data structure."
  ([chart-config]
   (compute-stats chart-config {}))
  ([chart-config {:keys [deep?] :or {deep? false}}]
   (stats.core/compute-chart-stats chart-config {:deep? deep?})))

(defn generate-repr
  "Generate markdown representation from pre-computed stats.
  Useful for testing representation separately from computation."
  [stats & {:keys [title timeline-events]}]
  (stats.repr/generate-representation
   {:title title
    :stats stats
    :timeline-events timeline-events}))

;;; -------------------------------------------------- Benchmarking ---------------------------------------------------

(defn- elapsed-ms
  "Execute f and return [result elapsed-ms]."
  [f]
  (let [start (System/nanoTime)
        result (f)
        end (System/nanoTime)]
    [result (/ (- end start) 1e6)]))

(defn bench-config
  "Benchmark analyze-chart with a provided chart config.

  Arguments:
    chart-config - a chart configuration map

  Options:
    :deep?    - run with deep statistics (default false)
    :warmup   - number of warmup iterations (default 3)
    :runs     - number of timed runs (default 5)

  Returns map with timing statistics."
  ([chart-config] (bench-config chart-config {}))
  ([chart-config {:keys [deep? warmup runs]
                  :or {deep? false warmup 3 runs 5}}]
   (let [run-fn #(analyze-chart/analyze-chart {:chart-config chart-config :deep deep?})
         n-series (count (:series chart-config))
         total-points (count-points chart-config)]
     ;; Warmup
     (dotimes [_ warmup]
       (run-fn))
     ;; Timed runs
     (let [times (mapv (fn [_] (second (elapsed-ms run-fn))) (range runs))]
       {:n-series n-series
        :total-points total-points
        :deep? deep?
        :runs runs
        :times-ms times
        :min-ms (apply min times)
        :max-ms (apply max times)
        :mean-ms (/ (reduce + times) (count times))
        :throughput-pts-per-ms (/ total-points (/ (reduce + times) (count times)))}))))

(defn quick-bench
  "Quick benchmark of analyze-chart with generated data.

  Arguments:
    n-points  - data points per series
    n-series  - number of series (default 1)

  Options:
    :deep?    - run with deep statistics (default false)
    :warmup   - number of warmup iterations (default 3)
    :runs     - number of timed runs (default 5)

  Returns map with timing statistics."
  ([n-points] (quick-bench n-points 1))
  ([n-points n-series] (quick-bench n-points n-series {}))
  ([n-points n-series opts]
   (let [config (generate-chart-config {:n-series n-series :n-points n-points})
         result (bench-config config opts)]
     (assoc result :n-points n-points))))

(defn print-bench-result
  "Print formatted benchmark results."
  [{:keys [n-points n-series total-points deep? runs
           min-ms max-ms mean-ms throughput-pts-per-ms]}]
  (if n-points
    (println (format "Benchmark: %d points × %d series = %d total (deep=%s)"
                     n-points n-series total-points deep?))
    (println (format "Benchmark: %d series, %d total points (deep=%s)"
                     n-series total-points deep?)))
  (println (format "  Runs: %d | Min: %.2f ms | Max: %.2f ms | Mean: %.2f ms"
                   runs min-ms max-ms mean-ms))
  (println (format "  Throughput: %.1f points/ms" throughput-pts-per-ms)))

(defn print-bench
  "Run quick-bench and print formatted results."
  ([n-points] (print-bench n-points 1))
  ([n-points n-series] (print-bench n-points n-series {}))
  ([n-points n-series opts]
   (print-bench-result (quick-bench n-points n-series opts))))

(defn bench-and-save
  "Benchmark and save the output to disk, then print results.

  Options:
    :deep?      - run with deep statistics (default false)
    :output-dir - output directory (default \"./analyze-chart-bench-runs\")
    :filename   - output filename (default \"output.md\")
    :warmup     - number of warmup iterations (default 3)
    :runs       - number of timed runs (default 5)"
  [chart-config & {:keys [deep? output-dir filename warmup runs]
                   :or {deep? false
                        output-dir "./analyze-chart-bench-runs"
                        filename "output.md"
                        warmup 3
                        runs 5}}]
  (let [result (bench-config chart-config {:deep? deep? :warmup warmup :runs runs})
        output (analyze-chart-output chart-config {:deep? deep?})
        path (str output-dir "/" filename)]
    (io/make-parents path)
    (spit path output)
    (print-bench-result result)
    (println (format "  Output saved to: %s" path))))

(comment
  ;; Generate a test config
  (def cfg (generate-chart-config {:n-series 3 :n-points 100}))

  ;; Load a config from disk
  (def cfg (load-chart-config "./chart_config_input.json"))

  ;; Look at the structure
  (keys cfg)
  (keys (:series cfg))
  (count-points cfg)

  ;; Get raw stats
  (def stats (compute-stats cfg))
  (def deep-stats (compute-stats cfg {:deep? true}))

  ;; Generate and print the markdown output
  (println (analyze-chart-output cfg))
  (println (analyze-chart-output cfg {:deep? true}))

  ;; Quick benchmark with generated data
  (quick-bench 100 3)
  (print-bench 100 3)
  (print-bench 1000 5 {:deep? true})

  ;; Benchmark with a loaded config
  (bench-config cfg)
  (bench-config cfg {:deep? true})
  (print-bench-result (bench-config cfg {:deep? true}))

  ;; Test different patterns
  (def volatile-cfg (generate-chart-config {:n-series 2 :n-points 50 :pattern :volatile}))
  (def seasonal-cfg (generate-chart-config {:n-series 2 :n-points 50 :pattern :seasonal}))
  (println (analyze-chart-output volatile-cfg {:deep? true}))

  ;; Benchmark and save output to disk
  (bench-and-save cfg :deep? true)
  (bench-and-save (load-chart-config "./chart_config_input.json") :deep? true)
  (bench-and-save cfg :deep? true :output-dir "./my-runs" :filename "test-run.md"))
