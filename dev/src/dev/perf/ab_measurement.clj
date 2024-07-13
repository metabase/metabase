(ns dev.perf.ab-measurement
  "Tools for reporting the impact on performance of a change to the BE.

  The idea is to mock out variable and/or expensive parts of the process (like real DW queries) and run a particular
  operation many times both with and without a change. Then the impact can be measured both in absolute terms and
  relative terms.

  The primary target for this operation is to common expensive operations in Metabase, such as QP pre- and
  post-processing, hydrating large things like dashboards, serdes conversion, etc.

  This is not implemented as a test because performance testing is very fragile and not comparable across machines
  or even on the same machine over time. But the hope is that having human PR reviewers look at a report of the runtime
  over a substantial sample size running both with and without a piece of logic, we can achieve high confidence that
  a given change either improves performance as hoped, or has acceptable impact."
  (:require
   [clojure.pprint :as pprint]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- format-nanos [nanos]
  (format "%.3fms" (double (/ nanos 1000000))))

(defmacro timed
  "Runs the `body` and returns the *runtime in microseconds*!

  The return value of the body is discarded."
  [& body]
  `(let [start# (System/nanoTime)]
     ~@body
     (- (System/nanoTime) start#)))

(defn- print-ab-stats [{[lhs _] :a, [rhs _] :b, :keys [calls]} stats]
  (pprint/print-table
    (for [row  (vals (into (sorted-map) stats))
          :let [lhs-value     (get row lhs)
                rhs-value     (get row rhs)]]
      {lhs                 (format-nanos lhs-value)
       (str lhs " (each)") (format-nanos (/ lhs-value calls))
       rhs                 (format-nanos rhs-value)
       (str rhs " (each)") (format-nanos (/ rhs-value calls))
       "Ratio"             (format "%.3f" (double (/ rhs-value lhs-value)))})))

(defn- with-ab-timing*
  "Tooling for A/B performance measurement. Use the [[ab-measure]] macro."
  [{:keys [a b rounds calls] :as setup} body-fn]
  (let [stats (atom {})]
    (doseq [round         (range 1 (inc rounds))
            [label value] [a b]]
      (binding [u/*ab-value* value]
        (let [delta (timed
                      (dotimes [_ calls]
                        (body-fn)))]
          (swap! stats assoc-in [round label] delta))))
    (print-ab-stats setup @stats)))

(defmacro with-ab-timing
  "Tooling for A/B performance measurement.

  This runs several **rounds** of A/B testing. Each round runs the **A** state `:calls` times, then the **B** state
  `:calls` times. The multiple rounds help to smooth out JIT, caching, and other \"getting faster over time\" effects.

  The two states are distinguished by the value bound to [[u/*ab-value*]]. You must tweak the code of the system under
  test to control the behaviour based on that value.

  `setup` is a map containing at minimum four keys:

  - `:a [label-a value-a]` for the **A** state - typically \"before\" some proposed change.
  - `:b [label-b value-b]` for the **B** state - typically \"after\" the change.
  - `:rounds 3` for the number of rounds. 3 or 4 rounds are recommended.
  - `:calls 100` for the number of calls in each round.
      - Be careful not to set these too high - the body process will run `(* :rounds 2 :calls)` times!

  The return value of the `body` is ignored.

  **A word of caution**

  Performance testing is a particularly fiddly process. Here are some tips for measuring things successfully:

  - Be very certain what you're really testing! Put some debug printing in the code (for both A and B states) and
    make sure they're running as many times as you expect and not eg. being cached or skipped.
      - Then take the printing out, it throws off the performance we're trying to measure.
  - Watch out for laziness! Use `doall` to fully realized any seqs.
  - The faster a single *call* is, the noisier it will be.
      - Increase `:calls` so the total for the round is 500ms or more.
  - Have at least 2 `:rounds`, ideally 3, to reduce the impact of JIT, CPU caches, etc. between individual *calls*.
  - Watch out for extra variables, such as disk seeks, network, databases, etc.
      - Use `with-redefs` or similar to mock out such calls to measure just what you mean."
  [setup & body]
  `(with-ab-timing* ~setup (fn [] ~@body)))

(defn- qp-overhead-ab
  "A/B testing for query processor *overhead*.

  Runs the query once, and then reuses the results for many simulated calls.

  The first argument is the same `setup` map as [[ab-measure]]."
  [{:keys [rounds calls] :as setup} query]
  (let [{{{cols :columns} :results_metadata
          rows            :rows}            :data} (mt/process-query query)]
    (binding [qp.pipeline/*execute* (fn [_driver _query respond]
                                      (respond {:cols cols} rows))]
      (log/infof "Running the QP (with *execute* stubbed out) over %d rounds of %d calls each\n" rounds calls)
      (with-ab-timing setup
        (when (not= (:status (mt/process-query query)) :completed)
          (throw (ex-info "failed" {})))))
    :done))

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private query-basic-orders
  (mt/userland-query (mt/mbql-query orders)))

(def ^:private query-complex-orders-joins-filters-etc
  (->> (mt/mbql-query
         orders
         {:filter [:and
                   [:> $subtotal 100]
                   [:= [:field %products.category {:source-field %product_id}] "Doohickey"]
                   [:= [:field %people.source {:source-field %user_id}]         "Facebook"]
                   [:= [:field %people.state  {:source-field %user_id}]         "MN"]]
          :aggregation [[:count] [:sum $subtotal]]
          :breakout    [!month.$created_at]})
       mt/userland-query))

(comment
  ;; An example call of the performance tooling.
  ;; But this won't actually measure anything unless the code is instrumented to check u/*ab-value*.
  (qp-overhead-ab {:a      ["Baseline"    false]
                   :b      ["Field Usage" true]
                   :rounds 4
                   :calls  10}
                  #_query-basic-orders
                  query-complex-orders-joins-filters-etc))
