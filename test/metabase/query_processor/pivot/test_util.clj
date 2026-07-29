(ns metabase.query-processor.pivot.test-util
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.pivot.test-util]}}}}}}
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.util.experiment :as experiment]))

(defn applicable-drivers
  "Drivers that these pivot table tests should run on"
  []
  (disj (mt/normal-drivers-with-feature :expressions :left-join :metadata/key-constraints)
        ;; Disable on Redshift due to OutOfMemory issue (see #18834)
        :redshift))

(def pivot-query-options
  "Pivot rows and columns for `pivot-query`"
  {:pivot_rows [1 0]
   :pivot_cols [2]})

(defn pivot-query
  "A basic pivot table query"
  ([]
   (pivot-query true))

  ([include-pivot-options?]
   (mt/dataset test-data
     (merge
      (mt/mbql-query orders
        {:aggregation [[:count] [:sum $orders.quantity]]
         :breakout    [$orders.user_id->people.state
                       $orders.user_id->people.source
                       $orders.product_id->products.category]})
      (when include-pivot-options?
        pivot-query-options)))))

(defn filters-query
  "A pivot table query with a filter applied"
  ([]
   (filters-query true))

  ([include-pivot-options?]
   (merge
    (mt/mbql-query orders
      {:aggregation [[:count]]
       :breakout    [$orders.user_id->people.state
                     $orders.user_id->people.source]
       :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]})
    (when include-pivot-options?
      {:pivot_rows [0]
       :pivot_cols [1]}))))

(defn parameters-query
  "A pivot table query with parameters"
  ([]
   (parameters-query true))

  ([include-pivot-options?]
   (merge
    (mt/mbql-query orders
      {:aggregation [[:count]]
       :breakout    [$orders.user_id->people.state
                     $orders.user_id->people.source]
       :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]
       :parameters  [{:type   "category"
                      :target [:dimension $orders.product_id->products.category]
                      :value  "Gadget"}]})
    (when include-pivot-options?
      {:pivot_rows [0]
       :pivot_cols [1]}))))

(defn pivot-card
  "A dashboard card query with a pivot table."
  []
  (let [dataset-query     (pivot-query false)
        metadata-provider (mt/metadata-provider)
        query             (lib/query metadata-provider dataset-query)
        breakouts         (into []
                                (comp (filter :lib/breakout?) (map :name))
                                (lib/returned-columns query))]
    {:dataset_query dataset-query
     :visualization_settings
     {:pivot_table.column_split
      {:rows    [(get breakouts 1) (get breakouts 0)]
       :columns [(get breakouts 2)]}}}))

(defn legacy-pivot-card
  "A dashboard card query with a pivot table. Uses legacy field ref-based viz settings."
  []
  (let [dataset-query (pivot-query false)
        breakout      (-> dataset-query :query :breakout)]
    {:dataset_query dataset-query
     :visualization_settings
     {:pivot_table.column_split
      {:rows    [(get breakout 1) (get breakout 0)]
       :columns [(get breakout 2)]}}}))

;;; ---- Pivot-path parity check ----
;;;
;;; The pivot dispatcher in `qp.pivot/run-pivot-query` uses the [[metabase.util.experiment]] framework to run BOTH
;;; the multi-query and native paths whenever the driver supports `:native-pivot-tables`. In production the candidate
;;; runs throttled and async; in tests we enable the experiment, run synchronously, and make a result mismatch fail
;;; the surrounding test loudly.

(defn- failing-report-fn
  "Experiment report-fn that records a mismatch as a `clojure.test` failure."
  [{exp-name :name :keys [match? control-outcome candidate-outcome]}]
  (when-not match?
    (t/do-report {:type     :fail
                  :message  (format "Pivot parity mismatch in experiment %s" exp-name)
                  :expected control-outcome
                  :actual   candidate-outcome})))

(defn do-with-pivot-parity-check
  "Functional form of [[with-pivot-parity-check]]. Calls `thunk` with the pivot-native-vs-multi experiment enabled,
  the candidate forced to run synchronously, and a report-fn that records mismatches as `clojure.test` failures.
  All overrides are thread-local `binding`s, so the fixture is safe to use under `^:parallel` tests."
  [thunk]
  (binding [experiment/*enabled-override*   true
            experiment/*report-fn-override* failing-report-fn
            experiment/*sync?*              true]
    (thunk)))

(defmacro with-pivot-parity-check
  "Run `body` with the pivot-native-vs-multi experiment forced on synchronously, with a report-fn that throws on
  mismatch. Any pivot query inside `body` whose driver supports `:native-pivot-tables` runs through both paths and
  the result row multisets are compared."
  [& body]
  `(do-with-pivot-parity-check (^:once fn* [] ~@body)))

(defmacro without-pivot-parity-check
  "Disable the pivot-native-vs-multi parity check inside `body`. Use for tests whose query intentionally exercises
  behavior that differs between the multi-query and native paths (e.g. the per-sub-query row cap applied by
  `metabase.query-processor.pivot/pivot-query-max-rows`)."
  [& body]
  `(binding [experiment/*enabled-override* false]
     ~@body))
