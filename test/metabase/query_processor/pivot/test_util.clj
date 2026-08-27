(ns metabase.query-processor.pivot.test-util
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.pivot.test-util]}}}}}}
  (:require
   [metabase.lib.core :as lib]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.test :as mt]))

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
;;; `qp.pivot/run-pivot-query` runs both the native and multi-query paths and reports mismatches whenever
;;; `qp.pivot/*check-pivot-parity?*` is on. That defaults to `true` in test builds, so every pivot query
;;; in the test suite gets parity coverage automatically — no fixture required. Tests that intentionally
;;; exercise behavior that differs between the two paths (e.g. the per-sub-query row cap applied by
;;; `qp.pivot/pivot-query-max-rows`) can wrap the divergent block in [[without-pivot-parity-check]].

(defmacro without-pivot-parity-check
  "Disable pivot parity checking inside `body`. Use for tests whose query intentionally exercises behavior
  that differs between the multi-query and native paths."
  [& body]
  `(binding [qp.pivot/*check-pivot-parity?* false]
     ~@body))
