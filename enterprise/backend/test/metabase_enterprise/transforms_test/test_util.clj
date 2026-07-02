(ns metabase-enterprise.transforms-test.test-util
  "Shared fixtures and helpers for the transforms-test driver-test namespaces
  (`chain-test`, `card-chain-test`, `e2e-test`, ...).

  The shared chain topology is a 2-node native chain over the test-data schema:

    t1 (enrich): orders ⋈ people → enriched   (per-order rows: total, state)
    t2 (target): enriched → aggregate count/revenue by state

  [[people-rows]]/[[orders-rows]] seed the leaves; [[correct-expected-csv]] /
  [[wrong-expected-csv]] are t2's expected output. e2e-test uses richer local
  fixtures that are load-bearing for its hand-derived expectations."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Query builders (Lib)
;;; ---------------------------------------------------------------------------

(defn table-query
  "A query reading physical table `table-id`."
  [table-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp table-id))))

(defn card-query
  "A query whose source is card `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn join-card
  "Join card `card-id` onto `query`. The condition is trivial — it exists only to
  register the joined card as a reference for extraction."
  [query card-id]
  (let [mp     (mt/metadata-provider)
        c-meta (lib.metadata/card mp card-id)
        lhs    (first (lib/returned-columns query))
        rhs    (first (lib/returned-columns (lib/query mp c-meta)))]
    (lib/join query (lib/join-clause c-meta [(lib/= lhs rhs)]))))

;;; ---------------------------------------------------------------------------
;;; Temp CSV files
;;; ---------------------------------------------------------------------------

(defn write-temp-csv!
  "Write csv-string to a temporary File and return it."
  ^File [csv-string]
  (doto (File/createTempFile "test-run-" ".csv")
    ;; JVM-exit backstop: with-temp-csv-files can't delete files bound before a
    ;; later binding's write throws.
    (.deleteOnExit)
    (spit csv-string)))

(defmacro with-temp-csv-files
  "Bind temp CSV Files from [name csv-str ...] pairs; delete all in finally."
  [bindings & body]
  (let [pairs   (partition 2 bindings)
        names   (mapv first pairs)
        strings (mapv second pairs)]
    `(let [~@(mapcat (fn [n s] [n `(write-temp-csv! ~s)]) names strings)]
       (try
         ~@body
         (finally
           ~@(map (fn [n] `(.delete ~n)) names))))))

;;; ---------------------------------------------------------------------------
;;; Warehouse invariant helpers
;;; ---------------------------------------------------------------------------

(defn count-test-scratch-tables
  "Count mb_transform_temp_table_test_* tables in `schema` via information_schema."
  [db-id schema]
  (let [result (qp.core/process-query
                {:database db-id
                 :type     :native
                 :native   {:query  (str "SELECT COUNT(*) FROM information_schema.tables"
                                         " WHERE table_schema = ?"
                                         " AND table_name LIKE 'mb_transform_temp_table_test_%'")
                            :params [schema]}})]
    (-> result (get-in [:data :rows]) first first int)))

;;; ---------------------------------------------------------------------------
;;; HTTP helpers
;;; ---------------------------------------------------------------------------

(def multipart-content-type
  "Request options for multipart endpoints (mt/user-http-request)."
  {:request-options {:headers {"content-type" "multipart/form-data"}}})

(defn subgraph-inputs-url
  "GET subgraph-inputs URL for a transform target."
  [id]
  (format "ee/transform-test/transform/%d/subgraph-inputs" id))

(defn subgraph-test-run-url
  "POST subgraph test-run URL for a transform target."
  [id]
  (format "ee/transform-test/transform/%d/subgraph" id))

(defn card-subgraph-inputs-url
  "GET subgraph-inputs URL for a card target."
  [id]
  (format "ee/transform-test/card/%d/subgraph-inputs" id))

(defn card-subgraph-test-run-url
  "POST subgraph test-run URL for a card target."
  [id]
  (format "ee/transform-test/card/%d/subgraph" id))

;;; ---------------------------------------------------------------------------
;;; Fixture CSV content (full real-schema headers; small row sets)
;;; ---------------------------------------------------------------------------

(def people-header
  "people columns in position order (matching the real test-data schema)."
  "id,address,email,password,name,city,longitude,state,source,birth_date,zip,latitude,created_at")

(def people-rows
  "3 people: ids 1 & 3 → CA, id 2 → TX."
  (str people-header "\n"
       "1,Addr,a@e.com,pw,Alice,SF,\"-1\",CA,g,1990-01-01,94102,\"37\",2020-01-01T00:00:00Z\n"
       "2,Addr,b@e.com,pw,Bob,Austin,\"-2\",TX,d,1985-01-01,78701,\"30\",2020-01-02T00:00:00Z\n"
       "3,Addr,c@e.com,pw,Carol,LA,\"-3\",CA,e,1978-01-01,90001,\"34\",2020-01-03T00:00:00Z\n"))

(def orders-header
  "orders columns in position order (matching the real test-data schema)."
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

(def orders-rows
  "4 orders: user 1 (CA) → 100 + 50, user 2 (TX) → 200, user 3 (CA) → 30."
  (str orders-header "\n"
       "1,1,10,90,10,100.00,,2024-01-01T00:00:00Z,1\n"
       "2,1,11,45,5,50.00,,2024-01-02T00:00:00Z,1\n"
       "3,2,12,180,20,200.00,,2024-01-03T00:00:00Z,1\n"
       "4,3,13,27,3,30.00,,2024-01-04T00:00:00Z,1\n"))

;;; ---------------------------------------------------------------------------
;;; The shared chain SQL + expected output
;;; ---------------------------------------------------------------------------

(def enrich-sql
  "t1: reads orders and people, produces per-order (total, state) rows."
  "SELECT o.total AS total, p.state AS state FROM orders o JOIN people p ON o.user_id = p.id")

(defn aggregate-sql
  "t2 / card query: aggregate `enriched-table` into (state, order_count, revenue)."
  [enriched-table]
  (str "SELECT state, count(*) AS order_count, sum(total) AS revenue"
       " FROM " enriched-table
       " GROUP BY state ORDER BY state"))

(def correct-expected-csv
  "Aggregate of [[orders-rows]] ⋈ [[people-rows]], ordered by state:
  CA: orders 1,2,4 → count 3, revenue 180.00; TX: order 3 → count 1, revenue 200.00."
  "state,order_count,revenue\nCA,3,180.00\nTX,1,200.00\n")

(def wrong-expected-csv
  "[[correct-expected-csv]] with the CA count deliberately wrong (9 instead of 3)."
  "state,order_count,revenue\nCA,9,180.00\nTX,1,200.00\n")
