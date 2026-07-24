(ns metabase.query-processor.middleware.results-metadata-perf-test
  "Performance regression tests for the query result pipeline.

  These tests measure the overhead of insights-xform (statistical fingerprinting)
  on query results and establish baseline thresholds to catch regressions.

  Background: insights-xform runs on every row of every query, creating Clojure
  maps per-row and triggering hasheq as the CPU hotspot. This was introduced in
  2018 and made structural in the 2020 streaming QP rewrite (#11832). Production
  measurements show 10x+ overhead for dashboard queries.

  See nix/performance-analysis.md for the full root cause analysis.

  Tagged :perf — excluded from normal CI, run explicitly:
    ./bin/test-agent :only '[metabase.query-processor.middleware.results-metadata-perf-test]'"
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.query-results :as qr]
   [metabase.query-processor.middleware.results-metadata :as middleware.results-metadata]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; ──────────────────────────────────────────────────────────────────
;;; Test helpers
;;; ──────────────────────────────────────────────────────────────────

(defn- generate-rows
  "Generate `n` rows of synthetic data with `ncols` columns.
  Produces vectors of mixed types (int, float, string, boolean) to
  simulate real OLAP workloads."
  [n ncols]
  (mapv (fn [i]
          (mapv (fn [c]
                  (case (mod c 4)
                    0 (+ i c)              ; int
                    1 (* i 1.1 (inc c))    ; float
                    2 (str "val_" i "_" c) ; string
                    3 (even? i)))          ; boolean
                (range ncols)))
        (range n)))

(defn- generate-col-metadata
  "Generate column metadata for `ncols` columns with types matching `generate-rows`."
  [ncols]
  (mapv (fn [c]
          {:name         (str "c" c)
           :display_name (str "Column " c)
           :base_type    (case (mod c 4)
                           0 :type/Integer
                           1 :type/Float
                           2 :type/Text
                           3 :type/Boolean)})
        (range ncols)))

(defn- time-reduce-ms
  "Time how long it takes to reduce `rows` through a reducing function `rf`.
  Returns elapsed milliseconds."
  [rf rows]
  (let [start (u/start-timer)]
    (transduce identity rf rows)
    (u/since-ms start)))

(defn- median
  "Return the median of a sequence of numbers."
  [xs]
  (let [sorted (sort xs)
        n      (count sorted)]
    (if (odd? n)
      (nth sorted (quot n 2))
      (/ (+ (nth sorted (dec (quot n 2)))
            (nth sorted (quot n 2)))
         2.0))))

(defn- benchmark
  "Run `f` for `warmup` + `rounds` iterations, return median of timed rounds in ms."
  [f & {:keys [warmup rounds] :or {warmup 3 rounds 5}}]
  (dotimes [_ warmup] (f))
  (median (repeatedly rounds f)))

;;; ──────────────────────────────────────────────────────────────────
;;; Baseline reducing function (conj into vector — the theoretical minimum)
;;; ──────────────────────────────────────────────────────────────────

(defn- baseline-rf
  "A minimal reducing function that just collects rows into a vector.
  Represents the absolute floor — no processing overhead."
  []
  (fn
    ([] [])
    ([acc] acc)
    ([acc x] (conj acc x))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: insights-rf per-row overhead
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf insights-rf-overhead-test
  (testing "insights-rf overhead should be bounded relative to baseline"
    ;; This test measures the raw cost of the insights reducing function
    ;; (fingerprinting + statistical analysis) vs a no-op baseline.
    ;; The overhead ratio tells us how expensive insights computation is
    ;; per row. If this ratio exceeds the threshold, someone has introduced
    ;; a per-row cost regression.
    (doseq [[label ncols nrows max-overhead-ratio]
            [["6col x 2K"   6   2000 15.0]
             ["20col x 2K"  20  2000 15.0]
             ["6col x 10K"  6  10000 15.0]
             ["20col x 10K" 20 10000 15.0]]]
      (testing (str label " — insights/baseline overhead ratio")
        (let [rows     (generate-rows nrows ncols)
              cols     (generate-col-metadata ncols)
              metadata {:cols cols}

              baseline-ms (benchmark
                           #(time-reduce-ms (baseline-rf) rows))
              insights-ms (benchmark
                           #(time-reduce-ms (qr/insights-rf metadata) rows))]
          ;; Print for visibility in test output
          (println (format "PERF: %s — baseline: %.1fms, insights: %.1fms, ratio: %.1fx"
                           label baseline-ms insights-ms
                           (/ insights-ms (max baseline-ms 0.1))))
          ;; The ratio should stay bounded. If insights-rf gets worse per-row,
          ;; this test catches it.
          (is (<= (/ insights-ms (max baseline-ms 0.1)) max-overhead-ratio)
              (format "%s: insights overhead %.1fx exceeds %.1fx threshold (baseline=%.1fms, insights=%.1fms)"
                      label (/ insights-ms (max baseline-ms 0.1)) max-overhead-ratio
                      baseline-ms insights-ms)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: combine-additional-reducing-fns per-row allocation cost
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf combine-additional-reducing-fns-overhead-test
  (testing "combine-additional-reducing-fns overhead should be bounded"
    ;; This isolates the cost of the combining mechanism itself — the wrapper
    ;; that runs insights as a side-channel on every row. The additional RF
    ;; here is trivial (just conj), so the overhead is purely from the
    ;; volatile!/vswap!/mapv machinery.
    (doseq [[label nrows max-overhead-ratio]
            [["2K rows"  2000  3.0]
             ["10K rows" 10000 3.0]
             ["20K rows" 20000 3.0]]]
      (testing (str label " — combine wrapper overhead")
        (let [rows (generate-rows nrows 10)

              bare-ms (benchmark
                       #(time-reduce-ms (baseline-rf) rows))

              combined-ms (benchmark
                           #(time-reduce-ms
                             (qp.reducible/combine-additional-reducing-fns
                              (baseline-rf)
                              [(baseline-rf)]
                              (fn [primary _additional] primary))
                             rows))]
          (println (format "PERF: %s — bare: %.1fms, combined: %.1fms, ratio: %.1fx"
                           label bare-ms combined-ms
                           (/ combined-ms (max bare-ms 0.1))))
          (is (<= (/ combined-ms (max bare-ms 0.1)) max-overhead-ratio)
              (format "%s: combine overhead %.1fx exceeds %.1fx threshold"
                      label (/ combined-ms (max bare-ms 0.1)) max-overhead-ratio)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: end-to-end query pipeline with and without insights
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf query-pipeline-insights-overhead-test
  (testing "Full query pipeline: insights-enabled vs insights-disabled"
    ;; This tests the actual user-visible overhead by running queries through
    ;; the real Metabase QP with and without insights. The speedup from
    ;; disabling insights should be significant (>1.5x for multi-column queries).
    ;; If it drops below that, either insights got cheaper (good!) or something
    ;; else got more expensive (investigate).
    (doseq [[label query-fn expected-rows min-speedup]
            [["venues (6 cols)"
              #(mt/mbql-query venues {:limit 2000})
              2000 1.3]
             ["orders (10 cols)"
              #(mt/mbql-query orders {:limit 2000})
              2000 1.3]]]
      (testing (str label " — speedup from disabling insights")
        (let [query (query-fn)

              with-insights-ms
              (benchmark
               #(u/do-with-timer-ms
                 (fn [elapsed-ms-fn]
                   (qp/process-query (qp/userland-query query))
                   (elapsed-ms-fn))))

              without-insights-ms
              (benchmark
               #(u/do-with-timer-ms
                 (fn [elapsed-ms-fn]
                   (qp/process-query
                    (qp/userland-query
                     (assoc-in query [:middleware :skip-results-metadata?] true)))
                   (elapsed-ms-fn))))

              speedup (/ with-insights-ms (max without-insights-ms 0.1))]
          (println (format "PERF: %s — with: %.1fms, without: %.1fms, speedup: %.2fx"
                           label with-insights-ms without-insights-ms speedup))
          (is (>= speedup min-speedup)
              (format "%s: expected >= %.1fx speedup, got %.2fx (with=%.1fms, without=%.1fms)"
                      label min-speedup speedup with-insights-ms without-insights-ms)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: MB_LUDICROUS_SPEED setting
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf ludicrous-speed-setting-test
  (testing "MB_LUDICROUS_SPEED=true skips insights and improves performance"
    (let [query (mt/mbql-query venues {:limit 2000})

          enabled-ms
          (benchmark
           #(u/do-with-timer-ms
             (fn [elapsed-ms-fn]
               (mt/with-temporary-setting-values [ludicrous-speed false]
                 (qp/process-query (qp/userland-query query)))
               (elapsed-ms-fn))))

          disabled-ms
          (benchmark
           #(u/do-with-timer-ms
             (fn [elapsed-ms-fn]
               (mt/with-temporary-setting-values [ludicrous-speed true]
                 (qp/process-query (qp/userland-query query)))
               (elapsed-ms-fn))))

          speedup (/ enabled-ms (max disabled-ms 0.1))]
      (println (format "PERF: setting test — enabled: %.1fms, disabled: %.1fms, speedup: %.2fx"
                       enabled-ms disabled-ms speedup))
      (is (>= speedup 1.2)
          (format "Expected >= 1.2x speedup from disabling insights, got %.2fx" speedup)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: per-row cost scaling (catches O(n*m) → O(n*m^2) regressions)
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf insights-cost-scales-linearly-with-rows-test
  (testing "insights-rf cost should scale linearly with row count (not quadratic)"
    ;; If someone introduces an accidental O(n^2) in the insights pipeline,
    ;; this test catches it by comparing 2x row count against 2x expected time.
    (let [ncols 10
          cols  (generate-col-metadata ncols)
          metadata {:cols cols}

          small-rows  (generate-rows 2000 ncols)
          large-rows  (generate-rows 10000 ncols)

          small-ms (benchmark #(time-reduce-ms (qr/insights-rf metadata) small-rows))
          large-ms (benchmark #(time-reduce-ms (qr/insights-rf metadata) large-rows))

          row-ratio  (/ (count large-rows) (count small-rows))  ; 5x
          time-ratio (/ large-ms (max small-ms 0.1))
          ;; Allow up to 2x the row ratio to account for cache effects, GC, etc.
          ;; If time grows faster than 2x the row growth, something is superlinear.
          max-time-ratio (* row-ratio 2.0)]
      (println (format "PERF: scaling — %d rows: %.1fms, %d rows: %.1fms, time-ratio: %.1fx (row-ratio: %.1fx)"
                       (count small-rows) small-ms (count large-rows) large-ms time-ratio row-ratio))
      (is (<= time-ratio max-time-ratio)
          (format "Superlinear scaling detected: %d→%d rows (%.1fx) took %.1fx longer (max allowed: %.1fx)"
                  (count small-rows) (count large-rows) row-ratio time-ratio max-time-ratio)))))

(deftest ^:perf insights-cost-scales-linearly-with-columns-test
  (testing "insights-rf cost should scale linearly with column count"
    ;; Same principle as above but for column scaling. The per-row map creation
    ;; cost should be O(cols), not O(cols^2).
    (let [nrows 5000

          small-cols  6
          large-cols  50

          small-metadata {:cols (generate-col-metadata small-cols)}
          large-metadata {:cols (generate-col-metadata large-cols)}

          small-rows (generate-rows nrows small-cols)
          large-rows (generate-rows nrows large-cols)

          small-ms (benchmark #(time-reduce-ms (qr/insights-rf small-metadata) small-rows))
          large-ms (benchmark #(time-reduce-ms (qr/insights-rf large-metadata) large-rows))

          col-ratio  (/ (double large-cols) small-cols)  ; ~8.3x
          time-ratio (/ large-ms (max small-ms 0.1))
          max-time-ratio (* col-ratio 2.0)]
      (println (format "PERF: col-scaling — %d cols: %.1fms, %d cols: %.1fms, time-ratio: %.1fx (col-ratio: %.1fx)"
                       small-cols small-ms large-cols large-ms time-ratio col-ratio))
      (is (<= time-ratio max-time-ratio)
          (format "Superlinear column scaling: %d→%d cols (%.1fx) took %.1fx longer (max: %.1fx)"
                  small-cols large-cols col-ratio time-ratio max-time-ratio)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tests: absolute time budgets
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:perf insights-absolute-budget-test
  (testing "insights-rf should complete within absolute time budgets"
    ;; These budgets are generous (2-3x observed baseline) to avoid flaky
    ;; failures across different CI hardware, while still catching 10x
    ;; regressions like the one that shipped in 2018-2020.
    (doseq [[label ncols nrows budget-ms]
            [["6col x 2K (typical dashboard)"    6  2000   500]
             ["20col x 2K (wide dashboard)"      20  2000  1500]
             ["6col x 10K (large result)"         6 10000  2000]
             ["20col x 10K (large wide result)"  20 10000  5000]]]
      (testing (str label " — should complete within " budget-ms "ms")
        (let [rows     (generate-rows nrows ncols)
              cols     (generate-col-metadata ncols)
              metadata {:cols cols}
              elapsed  (benchmark #(time-reduce-ms (qr/insights-rf metadata) rows))]
          (println (format "PERF: budget %s — %.1fms (budget: %dms)"
                           label elapsed budget-ms))
          (is (<= elapsed budget-ms)
              (format "%s: took %.1fms, exceeds %dms budget"
                      label elapsed budget-ms)))))))
