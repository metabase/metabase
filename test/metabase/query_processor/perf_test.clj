(ns metabase.query-processor.perf-test
  (:require
   [criterium.core :as crit]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.huge-query-metadata-providers :as lib.tu.huge]
   [metabase.lib.test-util.metadata-providers.mock :as lib.tu.mock]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.malli :as mu]))

  ;; TODO: (Braden 10/31/2025) Benchmarks to add:
  ;; - Dummy stages, eg. a bonus SELECT * stage on top
  ;;   - What about 4 stages?
  ;; - Return only a few cols from a huge table
  ;; - Big daisy-chain of joins

(def ^:private ids-per-table 100000)
(def ^:private db-id 1111)

(defn- id
  ([table-index] (* table-index ids-per-table))
  ([table-index field-index] (+ (id table-index)
                                field-index)))

(defn- mock-metadata
  "5 tables with 10 columns each."
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

(defn- compile-time
  "Given a query, compiles it several times and returns the stats."
  [mp-fn query-fn mem-fn]
  (crit/report-result
   (crit/quick-benchmark
    (mu/disable-enforcement
      (binding [lib.computed/*computed-cache* (mem-fn)]
        (qp.compile/compile (query-fn (mp-fn)))))
    {})))

(defn- computed-cache-on []
  (atom {}))
(defn- computed-cache-off []
  nil)

(comment
  ;; Preprocesses and compiles a query, with the `lib.computed` cache set throughout.
  ;; Useful for testing performance impact from the REPL for the large queries above.
  ;; Returns [nanoseconds result].
  (mu/disable-enforcement
    (let [compcache (atom {})]
      (binding [lib.computed/*computed-cache* compcache]
        (crit/time-body
         (let [mp (mp-small)
               q  (trivial-query mp)]
           (update (qp.compile/compile q) :query count))))))

  (let [mp   (mp-small)
        q1   (trivial-query mp)
        mp   (lib.tu/metadata-provider-with-card-from-query mp 12 q1)
        card (lib.metadata/card mp 12)
        q2   (lib/query mp card)]
    (lib/returned-columns (lib/query q2 (:dataset-query card))))

  ;; Runs Criterium benchmarks for a more statistically sound measurement of the speed of compiling various queries.
  ;; Pass computed-cache-on or computed-cache-off as the third argument to control whether the lib.computed memoization
  ;; is happening or not.
  ;; Back of the envelope analysis from the birth of lib.computed, on my 2022 M1 Max:
  ;; - Adding lib.computed added about 1ms of overhead to this trivial query against mp-small.
  ;; - For mp-small, 2.5ms before lib.computed; now 2.8ms with the cache disabled and 2.6ms with it enabled.
  ;; - For mp-medium, 21ms before lib.computed; now 20.2 with the cache disabled and 19.6ms with it enabled.
  ;;   - A small win for a trivial query with 100 columns in the table.
  ;; - For mp-large, 460ms before lib.computed; now 253ms with cache disabled and 255ms with it enabled.
  ;; - For mp-huge, it took about 62s each previously. Now about 11s with caching disabled and 8.8s with it enabled.
  ;; Note that the lib.computed/*computed-cache* doesn't actually help much with these straight table queries;
  ;; it's much more significant with nested queries, complex expressions and multiple joins.
  (compile-time mp-small  trivial-query computed-cache-off)
  (compile-time mp-small  trivial-query computed-cache-on)
  (compile-time mp-medium trivial-query computed-cache-off) ; 13.15ms - down 6ms with post-`lib.computed` fixes
  (compile-time mp-medium trivial-query computed-cache-on)  ; 13.02ms - likewise
  (compile-time mp-large  trivial-query computed-cache-off) ; 128.2ms - down 120ms
  (compile-time mp-large  trivial-query computed-cache-on)  ; 135.1ms - likewise

  ;; WARN: Don't run this one unless you're going to lunch, it's really slow to run that many times even with the
  ;; lib.computed caching on.
  #_(compile-time mp-huge   trivial-query computed-cache-on)

  ;; Instead, here's a single run with mp-huge:
  ;; Takes 11114ms with caching off, and 8825ms with it on for me.
  ;; Now with the quadratic behavior in add-alias-info fixed, it takes 1440ms!
  (crit/time-body
   (mu/disable-enforcement
     (binding [lib.computed/*computed-cache* (computed-cache-off)]
       (-> (qp.compile/compile (trivial-query (mp-huge)))
           (update :query count)))))

  ;; Using the "huge query" MetadataProvider, the big user query that came with QUE-2686.
  ;; Starting point: 205ms
  ;; Removed repeated MBQL 5 -> 4 -> 5 -> 4 conversions in `driver.sql.qp/preprocess`: down to 142ms
  ;; Fixing add-alias-info quadratic lookups: down to 115ms
  (compile-time (constantly nil)
                (fn [_mp] (lib.tu.huge/huge-query))
                computed-cache-off)

  ;; Saving the result for comparison with optimized versions!
  (defonce ^:private original-result (qp.compile/compile (lib.tu.huge/huge-query)))

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
