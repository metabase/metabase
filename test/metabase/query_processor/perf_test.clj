(ns metabase.query-processor.perf-test
  (:require
   [criterium.core :as crit]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.huge-query-metadata-providers :as lib.tu.huge]
   [metabase.lib.test-util.metadata-providers.mock :as lib.tu.mock]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.malli :as mu]))

(def ^:private ids-per-table 100000)
(def ^:private db-id 1111)

(defn- id
  ([table-index] (* table-index ids-per-table))
  ([table-index field-index] (+ (id table-index)
                                field-index)))

(defn- mock-metadata
  "Creates N tables with M columns each.

  The first column is a PK `ID` and all the others are `column_1` `:type/Integer` tables."
  [n-tables fields-each]
  (let [tables (for [index (range 1 (inc n-tables))]
                 (merge (meta/table-metadata :orders)
                        {:name         (str "table_" index)
                         :display-name (str "Table " index)
                         :db-id        db-id
                         :id           (* index ids-per-table)}))
        fields (for [table tables
                     index (range fields-each)]
                 (merge (if (zero? index)
                          (meta/field-metadata :orders :id)
                          (meta/field-metadata :orders :quantity))
                        {:id                (+ (:id table) index)
                         :table-id          (:id table)
                         :name              (if (zero? index)
                                              "id"
                                              (str "column_" index))
                         :display-name      (if (zero? index)
                                              "ID"
                                              (str "Column " index))
                         :position          index
                         :database-position index
                         :custom-position   index}))]
    {:database (merge meta/database
                      {:id   db-id
                       :name "perf-data"})
     :tables   tables
     :fields   fields}))

(def ^:private mock-metadata-small  (mock-metadata 5 10))
(def ^:private mock-metadata-medium (mock-metadata 5 100))
(def ^:private mock-metadata-large  (mock-metadata 5 1000))
(def ^:private mock-metadata-huge   (mock-metadata 5 10000))

(defn- mp-factory [mock-data]
  (-> mock-data
      lib.tu.mock/mock-metadata-provider
      lib.metadata.cached-provider/cached-metadata-provider))

(defn- mp-small []
  (mp-factory mock-metadata-small))
(defn- mp-medium []
  (mp-factory mock-metadata-medium))
(defn- mp-large []
  (mp-factory mock-metadata-large))
(defn- mp-huge []
  (mp-factory mock-metadata-huge))

;; WARN: Be careful with [[mp-huge]]! Its tables are 10k columns wide and it can take several seconds to preprocess
;; and compile queries against it. Running a single analysis is fine, but don't try to `crit/benchmark` it or you'll
;; be waiting tens of minutes!

(defn- trivial-query
  "Given a `MetadataProvider`, return a basic query that selects everything from table 1."
  [mp]
  (lib/query mp (lib.metadata/table mp (id 1))))

(defn- simple-count
  [mp]
  (-> (lib/query mp (lib.metadata/table mp (id 1)))
      (lib/aggregate (lib/count))))

(defn- stage+count
  [mp]
  (-> (lib/query mp (lib.metadata/table mp (id 1)))
      lib/append-stage
      (lib/aggregate (lib/count))))

(defn- extra-stages
  [base-query extras]
  (if (pos? extras)
    (recur (lib/append-stage base-query) (dec extras))
    base-query))

(defn- join-chain-5
  ([mp] (join-chain-5 mp (fn [_table-index join-clause]
                           join-clause)))
  ([mp fields-fn]
   (-> (lib/query mp (lib.metadata/table mp (id 1)))
       (lib/join (fields-fn 2 (lib/join-clause (lib.metadata/table mp (id 2))
                                               [(lib/= (lib.metadata/field mp (id 1 4))
                                                       (lib.metadata/field mp (id 2 0)))])))
       (lib/join (fields-fn 3 (lib/join-clause (lib.metadata/table mp (id 3))
                                               [(lib/= (lib.metadata/field mp (id 2 4))
                                                       (lib.metadata/field mp (id 3 0)))])))
       (lib/join (fields-fn 4 (lib/join-clause (lib.metadata/table mp (id 4))
                                               [(lib/= (lib.metadata/field mp (id 3 4))
                                                       (lib.metadata/field mp (id 4 0)))])))
       (lib/join (fields-fn 5 (lib/join-clause (lib.metadata/table mp (id 5))
                                               [(lib/= (lib.metadata/field mp (id 4 4))
                                                       (lib.metadata/field mp (id 5 0)))]))))))

(defn- join-chain-select-two-fields
  [mp]
  (-> (join-chain-5
       mp
       (fn [table-index join-clause]
         (lib/with-join-fields join-clause [(lib.metadata/field mp (id table-index 7))
                                            (lib.metadata/field mp (id table-index 8))])))
      (lib/with-fields [(lib.metadata/field mp (id 1 7))
                        (lib.metadata/field mp (id 1 8))])))

(defn- big-case-expression
  ([mp] (big-case-expression (lib/query mp (lib.metadata/table mp (id 1))) mp))
  ([base-query _mp]
   (let [cols  (lib/visible-columns base-query)
         col   (nth cols 5)
         cases (for [n (range 1 31)]
                 [(lib/= (lib/ref col) n)
                  (str "Case " n)])]
     (-> base-query
         (lib/with-fields [(nth cols 7)
                           (nth cols 8)])
         (lib/expression "big case" (lib/case cases "Default"))))))

(defn- big-case-expression-aggregated
  ([mp] (big-case-expression-aggregated (trivial-query mp) mp))
  ([base-query mp]
   (let [query   (big-case-expression base-query mp)
         expr-fn #(lib.options/ensure-uuid [:expression {} "big case"])]
     (-> query
         (lib/aggregate (lib/sum (expr-fn)))
         (lib/aggregate (lib/avg (expr-fn)))
         (lib/aggregate (lib/min (expr-fn)))
         (lib/aggregate (lib/max (expr-fn)))))))

(defn- big-case-expression-extra-stages
  [mp n]
  (-> (trivial-query mp)
      (extra-stages n)
      (big-case-expression mp)))

(defn- big-case-expression-extra-stage
  [mp]
  (big-case-expression-extra-stages mp 1))

(defn- big-case-expression-extra-stage-aggregated
  [mp]
  (-> (trivial-query mp)
      (extra-stages 1)
      (big-case-expression-aggregated mp)))

(defn- compile-time
  "Given a query, compiles it several times and returns the stats."
  [mp-fn query-fn]
  (crit/report-result
   (crit/quick-benchmark
    (mu/disable-enforcement
      (qp.compile/compile (query-fn (mp-fn))))
    {})))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- compile-time1
  "Times a single run rather than [[crit/quick-benchmark]]."
  [mp-fn query-fn _mem-fn]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (time (mu/disable-enforcement
          (qp.compile/compile (query-fn (mp-fn))))))

(comment
  ;; Preprocesses and compiles a query, with the `lib.computed` cache set throughout.
  ;; Useful for testing performance impact from the REPL for the large queries above.
  ;; Returns [nanoseconds result].
  (mu/disable-enforcement
    (crit/time-body
     (let [mp (mp-small)
           q  (trivial-query mp)]
       (update (qp.compile/compile q) :query count))))

  ;; ======================================== Core Benchmarks ========================================
  ;; Criterium benchmarks for a more statistically sound measurement of the speed of compiling various queries.
  ;; See https://docs.google.com/spreadsheets/d/1Gb-cpuLTziJeCIqh7mEKrjbFm93BAtzPBU1H655_Qdw/edit?gid=0#gid=0
  ;; for measurements from the latest 55, 56 and 57 releases.

  ;; Summary: 55 has some bad bits but is mostly good in practice; 56 got 3-4x worse generally from overhead
  ;; but on a few dimensions (wide tables, big expressions) it got much worse. Like 70ms in 55 vs. 6500ms in 56.
  ;; 57.2.1 after the first batch of perf fixes is equal to or better than 55 in some areas, but is still worse
  ;; in a few. More profiling and perf fixes to come!

  ;; Select all straight from the table
  (compile-time mp-small  trivial-query)
  (compile-time mp-medium trivial-query)
  (compile-time mp-large  trivial-query)

  ;; Count aggregation
  (compile-time mp-small  simple-count)
  (compile-time mp-medium simple-count)
  (compile-time mp-large  simple-count)

  ;; Stage + count; this simulates aggregating a table-like model
  (compile-time mp-small  stage+count)
  (compile-time mp-medium stage+count)
  (compile-time mp-large  stage+count)

  ;; Join chain, select all:
  (compile-time mp-small  join-chain-5)
  (compile-time mp-medium join-chain-5)
  (compile-time mp-large  join-chain-5)

  ;; Join chain, select just a few fields from each one
  (compile-time mp-small  join-chain-select-two-fields)
  (compile-time mp-medium join-chain-select-two-fields)
  (compile-time mp-large  join-chain-select-two-fields)

  ;; Two stages
  (compile-time mp-small  #(extra-stages (trivial-query %) 1))
  (compile-time mp-medium #(extra-stages (trivial-query %) 1))
  (compile-time mp-large  #(extra-stages (trivial-query %) 1))

  ;; Four stages
  (compile-time mp-small  #(extra-stages (trivial-query %) 3))
  (compile-time mp-medium #(extra-stages (trivial-query %) 3))
  (compile-time mp-large  #(extra-stages (trivial-query %) 3))

  ;; Eight stages
  (compile-time mp-small  #(extra-stages (trivial-query %) 7))
  (compile-time mp-medium #(extra-stages (trivial-query %) 7))
  (compile-time mp-large  #(extra-stages (trivial-query %) 7))

  ;; Big :case expression (30 cases on the same field)
  (compile-time mp-small  big-case-expression)
  (compile-time mp-medium big-case-expression)
  (compile-time mp-large  big-case-expression)

  ;; Big :case expression in second stage
  (compile-time mp-small  big-case-expression-extra-stage)
  (compile-time mp-medium big-case-expression-extra-stage)
  (compile-time mp-large  big-case-expression-extra-stage)

  ;; Big :case expression in **fourth** stage
  (compile-time mp-small  #(big-case-expression-extra-stages % 3))
  (compile-time mp-medium #(big-case-expression-extra-stages % 3))
  (compile-time mp-large  #(big-case-expression-extra-stages % 3))

  ;; Big :case expression aggregated
  (compile-time mp-small  big-case-expression-aggregated)
  (compile-time mp-medium big-case-expression-aggregated)
  (compile-time mp-large  big-case-expression-aggregated)

  ;; Big :case expression in second stage plus aggregation
  (compile-time mp-small  big-case-expression-extra-stage-aggregated)
  (compile-time mp-medium big-case-expression-extra-stage-aggregated)
  (compile-time mp-large  big-case-expression-extra-stage-aggregated)

  ;; WARN: Don't run this one unless you're going to lunch, it's really slow to run that many times even with the
  ;; lib.computed caching on.
  #_(compile-time mp-huge   trivial-query nil)

  ;; Instead, here's a single run with mp-huge:
  (crit/time-body
   (mu/disable-enforcement
     (-> (qp.compile/compile (trivial-query (mp-huge)))
         (update :query count))))

  ;; Using the "huge query" MetadataProvider, the big user query that came with QUE-2686.
  (compile-time (constantly nil)
                (fn [_mp] (lib.tu.huge/huge-query)))

  ;; Saving the result for comparison with optimized versions!
  (defonce ^:private original-result (qp.compile/compile (lib.tu.huge/huge-query)))

  (require '[clj-async-profiler.core :as prof])
  (prof/serve-ui 9111)

  (def optimized-result
    (mu/disable-enforcement
      (let [q (lib.tu.huge/huge-query)
            [t result] (crit/time-body
                        (qp.compile/compile q))]
        #_{:clj-kondo/ignore [:discouraged-var]}
        (println (format "%.2fms" (/ t 1000000.0)))
        result)))

  (= optimized-result
     original-result))
