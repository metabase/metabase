(ns ^:mb/driver-tests metabase.transforms.test-run.chain-test
  "End-to-end tests for the chained (sub-graph) test-run orchestrator
  ([[metabase.transforms.test-run.chain/run-chain-test!]]) and the generalized HTTP
  endpoints (`POST /api/transform-test/:target-type/:id/subgraph`,
  `GET /api/transform-test/:target-type/:id/subgraph-inputs`).

  Builds a 2-node native chain on the test-data schema:

    t1 (enrich): orders ⋈ people → <enriched>   (per-order rows with state, total)
    t2 (target): <enriched> → aggregate count/revenue by state

  Selecting source {t1} + target {t2} makes the slice {t1, t2} with leaves
  {orders, people}; the executor seeds the two leaves, runs t1 into a scratch
  table, redirects t2's reference to t1's output (accumulating remap), runs t2,
  and diffs t2's output against the expected CSV."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt]
   [metabase.transforms-rest.api.transform]
   [metabase.transforms-rest.api.util :as api-util]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.test-run.chain :as chain]
   [metabase.transforms.test-run.execute :as test-run.execute]
   [metabase.transforms.test-run.scratch :as scratch]
   [metabase.transforms.test-run.test-util :refer [with-temp-csv-files]]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-test-scratch-tables [db-id schema]
  (let [result (qp.core/process-query
                {:database db-id
                 :type     :native
                 :native   {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                        " WHERE table_schema = '" schema "'"
                                        " AND table_name LIKE 'mb_transform_temp_table_test_%'")}})]
    (-> result (get-in [:data :rows]) first first int)))

;;; ---------------------------------------------------------------------------
;;; Fixture CSV content (full real-schema headers; small row sets)
;;; ---------------------------------------------------------------------------

(def ^:private people-header
  "id,address,email,password,name,city,longitude,state,source,birth_date,zip,latitude,created_at")

;; 3 people: ids 1 & 3 → CA, id 2 → TX
(def ^:private people-rows
  (str people-header "\n"
       "1,Addr,a@e.com,pw,Alice,SF,\"-1\",CA,g,1990-01-01,94102,\"37\",2020-01-01T00:00:00Z\n"
       "2,Addr,b@e.com,pw,Bob,Austin,\"-2\",TX,d,1985-01-01,78701,\"30\",2020-01-02T00:00:00Z\n"
       "3,Addr,c@e.com,pw,Carol,LA,\"-3\",CA,e,1978-01-01,90001,\"34\",2020-01-03T00:00:00Z\n"))

(def ^:private orders-header
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

;; 4 orders: user 1 (CA) → 100 + 50, user 2 (TX) → 200, user 3 (CA) → 30
(def ^:private orders-rows
  (str orders-header "\n"
       "1,1,10,90,10,100.00,,2024-01-01T00:00:00Z,1\n"
       "2,1,11,45,5,50.00,,2024-01-02T00:00:00Z,1\n"
       "3,2,12,180,20,200.00,,2024-01-03T00:00:00Z,1\n"
       "4,3,13,27,3,30.00,,2024-01-04T00:00:00Z,1\n"))

;; Expected target output, ordered by state:
;;   CA: orders 1,2,4 → count 3, revenue 180.00
;;   TX: order 3      → count 1, revenue 200.00
(def ^:private correct-expected-csv
  "state,order_count,revenue\nCA,3,180.00\nTX,1,200.00\n")

;; CA count deliberately wrong (9 instead of 3).
(def ^:private wrong-expected-csv
  "state,order_count,revenue\nCA,9,180.00\nTX,1,200.00\n")

;;; ---------------------------------------------------------------------------
;;; The chain under test
;;; ---------------------------------------------------------------------------

(def ^:private enrich-sql
  (str "SELECT o.id AS order_id, o.total AS total, p.state AS state"
       " FROM orders o JOIN people p ON o.user_id = p.id"))

(defn- aggregate-sql [enriched-table]
  (str "SELECT state, count(*) AS order_count, sum(total) AS revenue"
       " FROM " enriched-table
       " GROUP BY state ORDER BY state"))

;;; ===========================================================================
;;; Passed: full native chain (source t1 → target t2)
;;; ===========================================================================

(deftest chain-native-passed-test
  (testing "2-node native chain runs end-to-end and passes against the correct expected CSV"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)
                before-runs    (t2/count :model/TransformRun)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv {})]
                (testing "status is passed"
                  (is (= :passed (:status result))
                      (str "Expected passed; diff: " (pr-str (:diff result)))))
                (testing "run order is topological (t1 before t2)"
                  (is (= [(:id t1) (:id t2)] (:order result))))
                (testing "diff sections are empty"
                  (is (empty? (get-in result [:diff :missing-rows])))
                  (is (empty? (get-in result [:diff :extra-rows])))
                  (is (empty? (get-in result [:diff :cell-mismatches]))))
                (testing "all scratch tables cleaned up (2 leaves + 2 node outputs)"
                  (is (= before-scratch (count-test-scratch-tables db-id schema))))
                (testing "no TransformRun row created"
                  (is (= before-runs (t2/count :model/TransformRun))))))))))))

;;; ===========================================================================
;;; Failed: wrong expected value triggers a diff mismatch
;;; ===========================================================================

(deftest chain-native-failed-test
  (testing "wrong expected CA count → failed with a named diff, scratch still cleaned"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            wrong-expected-csv {})]
                (testing "status is failed"
                  (is (= :failed (:status result))))
                (testing "diff reports the discrepancy"
                  (is (or (seq (get-in result [:diff :missing-rows]))
                          (seq (get-in result [:diff :extra-rows]))
                          (seq (get-in result [:diff :cell-mismatches])))))
                (testing "scratch cleaned up even on a failed diff"
                  (is (= before-scratch (count-test-scratch-tables db-id schema))))))))))))

;;; ===========================================================================
;;; HTTP endpoints: GET subgraph-inputs + POST subgraph
;;; ===========================================================================

(def ^:private multipart-content-type
  {:request-options {:headers {"content-type" "multipart/form-data"}}})

(defn- subgraph-inputs-url [id] (format "transform-test/transform/%d/subgraph-inputs" id))
(defn- subgraph-test-run-url [id] (format "transform-test/transform/%d/subgraph" id))
(defn- card-subgraph-inputs-url [id] (format "transform-test/card/%d/subgraph-inputs" id))
(defn- card-subgraph-test-run-url [id] (format "transform-test/card/%d/subgraph" id))

(deftest subgraph-inputs-endpoint-test
  (testing "GET subgraph-inputs returns the leaf input tables for (target, sources)"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (let [resp (mt/user-http-request :crowberto :get 200 (subgraph-inputs-url (:id t2))
                                               :sources (:id t1))]
                (testing "both leaf tables (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :table_id resp)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and (string? (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              resp)))))))))))

(deftest subgraph-test-run-endpoint-passed-test
  (testing "POST subgraph runs the chain and returns 200 passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (count-test-scratch-tables db-id schema)))))))))))))

(deftest subgraph-test-run-endpoint-bad-source-test
  (testing "POST subgraph with a source that does not feed the target → 400 error envelope"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [;; _t1 exists only so t2's reference to enriched-name resolves into a chain.
                           :model/Transform _t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}
                           ;; t3 is unrelated — reads orders only, does not feed t2.
                           :model/Transform t3
                           {:source {:type :query :query (lib/native-query mp "SELECT id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 400 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t3)])})]
                  (testing "error envelope is returned"
                    (is (= "error" (:status resp)))
                    (is (string? (get-in resp [:error :message])))))))))))))

;;; ===========================================================================
;;; HTTP endpoints: card target (generalized /api/transform-test/card/…)
;;;
;;; The card reads `enriched` — a synced table produced by transform t1 — so the
;;; slice is {t1} with leaves {orders, people}: the transform-target tests with a
;;; card swapped in for the target node. (A card over a raw table with no transform
;;; in the slice — "just supply input tables" — is a separate, deferred case.)
;;; ===========================================================================

(defmacro ^:private with-enrich-card
  "Bind `t1-sym` to the enrich transform and `card-sym` to a native card that
  aggregates t1's (synced) output table by state."
  [[t1-sym card-sym] & body]
  `(let [enriched-name# (mt/random-name)
         db-id#         (mt/id)
         mp#            (mt/metadata-provider)]
     (mt/with-temp [:model/Table tbl#
                    {:db_id db-id# :schema "public" :name enriched-name# :active true}
                    :model/Transform ~t1-sym
                    {:source          {:type :query :query (lib/native-query mp# enrich-sql)}
                     :target          {:schema "public" :type "table" :name enriched-name#}
                     :target_table_id (:id tbl#)}
                    :model/Card ~card-sym
                    {:dataset_query {:database db-id# :type "native"
                                     :native   {:query (aggregate-sql enriched-name#)}}}]
       ~@body)))

(deftest card-subgraph-inputs-endpoint-test
  (testing "GET card subgraph-inputs returns the card's boundary leaf tables"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-card [t1 card]
              (let [resp (mt/user-http-request :crowberto :get 200 (card-subgraph-inputs-url (:id card))
                                               :sources (:id t1))]
                (testing "both leaves (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :table_id resp)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and (string? (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              resp)))))))))))

(deftest card-subgraph-test-run-endpoint-passed-test
  (testing "POST card subgraph runs a card target over the chain → 200 passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (count-test-scratch-tables db-id schema)]
            (with-enrich-card [t1 card]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (card-subgraph-test-run-url (:id card))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (count-test-scratch-tables db-id schema)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Native card, failed case (endpoint)
;;; ---------------------------------------------------------------------------

(deftest card-subgraph-test-run-endpoint-failed-test
  (testing "POST card subgraph with wrong expected CSV → 200 failed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-card [t1 card]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f wrong-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (card-subgraph-test-run-url (:id card))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is failed"
                    (is (= "failed" (:status resp))
                        (str "Expected failed; body: " (pr-str resp)))))))))))))

;;; ===========================================================================
;;; HTTP endpoints: card target — stored MBQL card
;;;
;;; The MBQL card is stored via `mt/with-temp :model/Card`, so its
;;; `dataset_query` is lib-normalized (pMBQL form) when the endpoint reads it
;;; back — the path W2 fixed but that was only verified for native stored cards.
;;;
;;; Topology: same t1 (enrich) slice as native tests; card does COUNT(*) over
;;; the enriched scratch table via MBQL source-table → 4 rows → count = 4.
;;; Fields are created on the temp Table so the MBQL metadata provider can
;;; build a valid query stage.
;;; ===========================================================================

(defmacro ^:private with-enrich-mbql-card
  "Bind `t1-sym` to the enrich transform and `card-sym` to a *stored* MBQL card
  (persisted via `mt/with-temp :model/Card`) that does COUNT(*) over t1's
  (synced) output table. Adds two `:model/Field` rows so the MBQL metadata
  provider can build a valid query stage."
  [[t1-sym card-sym] & body]
  (let [f-total (gensym "field-total")
        f-state (gensym "field-state")]
    `(let [enriched-name# (mt/random-name)
           db-id#         (mt/id)
           mp#            (mt/metadata-provider)]
       (mt/with-temp [:model/Table tbl#
                      {:db_id db-id# :schema "public" :name enriched-name# :active true}
                      :model/Field ~f-total
                      {:table_id  (:id tbl#) :name "total"
                       :base_type :type/Float :position 0 :active true}
                      :model/Field ~f-state
                      {:table_id  (:id tbl#) :name "state"
                       :base_type :type/Text  :position 1 :active true}
                      :model/Transform ~t1-sym
                      {:source          {:type :query :query (lib/native-query mp# enrich-sql)}
                       :target          {:schema "public" :type "table" :name enriched-name#}
                       :target_table_id (:id tbl#)}
                      :model/Card ~card-sym
                      {:database_id   db-id#
                       :dataset_query {:database db-id#
                                       :type     "query"
                                       :query    {:source-table (:id tbl#)
                                                  :aggregation  [[:count]]}}}]
         ~@body))))

;;; 4 fixture orders → enriched has 4 rows → COUNT = 4
(def ^:private mbql-card-expected-csv "count\n4\n")
(def ^:private mbql-card-wrong-csv    "count\n99\n")

(deftest card-mbql-subgraph-inputs-endpoint-test
  (testing "GET card/subgraph-inputs for a stored MBQL card returns the leaf tables"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-mbql-card [t1 card]
              (let [resp (mt/user-http-request :crowberto :get 200 (card-subgraph-inputs-url (:id card))
                                               :sources (:id t1))]
                (testing "both leaves (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :table_id resp)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and (string? (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              resp)))))))))))

(deftest card-mbql-subgraph-test-run-endpoint-passed-test
  (testing "POST card/subgraph for a stored MBQL card → 200 passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (count-test-scratch-tables db-id "public")]
            (with-enrich-mbql-card [t1 card]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f mbql-card-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (card-subgraph-test-run-url (:id card))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (count-test-scratch-tables db-id "public")))))))))))))

(deftest card-mbql-subgraph-test-run-endpoint-failed-test
  (testing "POST card/subgraph for a stored MBQL card with wrong expected CSV → 200 failed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (count-test-scratch-tables db-id "public")]
            (with-enrich-mbql-card [t1 card]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f mbql-card-wrong-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (card-subgraph-test-run-url (:id card))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is failed"
                    (is (= "failed" (:status resp))
                        (str "Expected failed; body: " (pr-str resp))))
                  (testing "no scratch tables remain even on failure"
                    (is (= before-scratch (count-test-scratch-tables db-id "public")))))))))))))

(deftest card-target-read-check-test
  (testing "card target enforces read-check :model/Card — no collection access → 403"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card card {:collection_id (:id coll)
                                     :dataset_query {:database (mt/id)
                                                     :type     "native"
                                                     :native   {:query "SELECT 1 AS n"}}}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (with-temp-csv-files [expected-f "n\n1\n"]
          (mt/user-http-request
           :rasta :post 403 (card-subgraph-test-run-url (:id card))
           multipart-content-type
           {"expected" expected-f}))))))

(deftest metric-target-rejected-test
  (testing "metric target-type is rejected with 422 (no defined standalone rowset to diff)"
    (is (some? (mt/user-http-request :crowberto :get 422 "transform-test/metric/1/subgraph-inputs")))))

;;; ===========================================================================
;;; Contract: cleanup! runs inside the transform connection context
;;; ===========================================================================

;;; ===========================================================================
;;; Step 10 — Assertions wired into run-chain-test! and run-card-chain-test!
;;;
;;; All tests run on :postgres with the standard test-data chain (t1 → t2).
;;; Assertion SQL is written against the real table names (orders, people,
;;; t2's real output table) — the harness remaps them to scratch at run time.
;;; The `test_output` alias is also exercised (Step 10.5).
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; Step 10.1 — passing assertion (transform target)
;;; ---------------------------------------------------------------------------

(deftest chain-assertion-passing-test
  (testing "run-chain-test! with a passing assertion → :passed + :assertions [{:status :passed}]"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv
                            {:assertions [{:name "revenue_nonneg"
                                           :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                           :severity :error}]})]
                (testing "overall status is :passed"
                  (is (= :passed (:status result))))
                (testing ":assertions is a single-entry vector"
                  (is (= 1 (count (:assertions result)))))
                (testing "assertion status is :passed"
                  (is (= :passed (get-in result [:assertions 0 :status]))))
                (testing "failing_row_count is 0"
                  (is (zero? (get-in result [:assertions 0 :failing_row_count]))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 10.2 — failing assertion (transform target)
;;; ---------------------------------------------------------------------------

(deftest chain-assertion-failing-test
  (testing "run-chain-test! with a failing assertion → :failed, positive failing_row_count"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv
                            {:assertions [{:name "always_fails"
                                           ;; SELECT * FROM <target> returns rows → always fails
                                           :sql  (str "SELECT * FROM " target-name)
                                           :severity :error}]})]
                (testing "overall status is :failed"
                  (is (= :failed (:status result))))
                (testing "failing_row_count > 0"
                  (is (pos? (get-in result [:assertions 0 :failing_row_count]))))
                (testing "assertion status is :failed"
                  (is (= :failed (get-in result [:assertions 0 :status]))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 10.3 — warn-severity failing assertion does not fail the run
;;; ---------------------------------------------------------------------------

(deftest chain-assertion-warn-does-not-fail-run-test
  (testing "warn-severity failing assertion → overall :passed, assertion :warn"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv
                            {:assertions [{:name "warn_always_fails"
                                           :sql  (str "SELECT * FROM " target-name)
                                           :severity :warn}]})]
                (testing "overall status is :passed (warn does not flip overall)"
                  (is (= :passed (:status result))))
                (testing "assertion status is :warn"
                  (is (= :warn (get-in result [:assertions 0 :status]))))
                (testing "failing_row_count > 0"
                  (is (pos? (get-in result [:assertions 0 :failing_row_count]))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 10.4 — no expected CSV, assertions only
;;; ---------------------------------------------------------------------------

(deftest chain-assertions-only-no-expected-test
  (testing "run-chain-test! with no expected CSV and passing assertion → :passed, :diff nil"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            nil  ; no expected CSV
                            {:assertions [{:name "revenue_nonneg"
                                           :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                           :severity :error}]})]
                (testing "overall status is :passed"
                  (is (= :passed (:status result))))
                (testing ":diff is nil when no expected CSV"
                  (is (nil? (:diff result))))
                (testing ":assertions entry is present and passed"
                  (is (= :passed (get-in result [:assertions 0 :status]))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 10.5 — test_output alias works in assertions (transform target)
;;; ---------------------------------------------------------------------------

(deftest chain-assertion-test-output-alias-test
  (testing "assertion SQL referencing test_output (not the real table name) runs correctly"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (let [result (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv
                            {:assertions [{:name "no_negative_revenue_via_alias"
                                           ;; Uses test_output alias instead of real table name
                                           :sql  "SELECT * FROM test_output WHERE revenue < 0"
                                           :severity :error}]})]
                (testing "overall status is :passed"
                  (is (= :passed (:status result))))
                (testing "assertion using test_output alias passes"
                  (is (= :passed (get-in result [:assertions 0 :status]))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 10.6 — card target, assertions via :cte binding (no extra scratch table)
;;; ---------------------------------------------------------------------------

(deftest card-chain-assertion-cte-binding-test
  (testing "run-card-chain-test! with assertions via CTE binding — no extra scratch table"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (count-test-scratch-tables db-id "public")]
            (with-enrich-card [t1 card]
              (let [result (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id orders-rows people-id people-rows}
                            correct-expected-csv
                            {:assertions [{:name "result_nonneg_revenue"
                                           ;; test_output refers to the card's compiled SQL CTE
                                           :sql  "SELECT * FROM test_output WHERE revenue < 0"
                                           :severity :error}]})]
                (testing "overall status is :passed"
                  (is (= :passed (:status result))))
                (testing "assertion status is :passed"
                  (is (= :passed (get-in result [:assertions 0 :status]))))
                (testing "no extra scratch tables remain (CTE binding creates no tables)"
                  (is (= before-scratch (count-test-scratch-tables db-id "public"))))))))))))

;;; ===========================================================================
;;; Step 11 — HTTP endpoint wires assertions
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; Step 11.1 — assertions=[] → same response shape as before (regression)
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-empty-assertions-regression-test
  (testing "POST /subgraph with assertions=[] → 200 passed, same shape as before"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])
                             "assertions"             (json/encode [])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))))
                  (testing "assertions key is nil (no assertions run)"
                    (is (nil? (:assertions resp)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 11.2 — assertions + no expected → 200 + assertion results
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertions-no-expected-test
  (testing "POST /subgraph with assertions and no expected → 200, :assertions in response"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (with-temp-csv-files [orders-f orders-rows
                                    people-f people-rows]
                (let [assertions-json (json/encode
                                       [{:name "revenue_nonneg"
                                         :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                         :severity "error"}])
                      resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "sources"                (json/encode [(:id t1)])
                             "assertions"             assertions-json})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))))
                  (testing ":diff is nil"
                    (is (nil? (:diff resp))))
                  (testing ":assertions has one entry"
                    (is (= 1 (count (:assertions resp)))))
                  (testing "assertion status is passed"
                    (is (= "passed" (-> resp :assertions first :status)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 11.3 — assertions + expected → 200 + diff + assertions
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertions-and-expected-test
  (testing "POST /subgraph with assertions AND expected → 200, both :diff and :assertions"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [assertions-json (json/encode
                                       [{:name "no_negative"
                                         :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                         :severity "error"}])
                      resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])
                             "assertions"             assertions-json})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))))
                  (testing ":diff is present"
                    (is (some? (:diff resp))))
                  (testing ":assertions is present"
                    (is (= 1 (count (:assertions resp)))))
                  (testing "assertion passed"
                    (is (= "passed" (-> resp :assertions first :status)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 11.4 — malformed assertions JSON → 400
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-malformed-assertions-test
  (testing "POST /subgraph with malformed assertions JSON → 400"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                enriched-name (mt/random-name)]
            (mt/with-temp [:model/Transform _t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [expected-f correct-expected-csv]
                ;; Send invalid JSON as the assertions part.
                (mt/user-http-request
                 :crowberto :post 400 (subgraph-test-run-url (:id t2))
                 multipart-content-type
                 {"expected"   expected-f
                  "assertions" "this is not json"})))))))))

;;; ---------------------------------------------------------------------------
;;; Step 11.5 — assertion referencing a real table → 422
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertion-real-table-reference-test
  (testing "POST /subgraph with assertion referencing a real (non-scratch) table → 200 with :failed assertion"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                target-name   (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name target-name}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                ;; products is a real table not in the mapping — verify guard 2 fires.
                ;; Since per-assertion prepare captures this as a terminal error (not a
                ;; run-level throw), the response is 200 with the assertion as :failed.
                ;; This is the correct design: a bad assertion is a test-run result, not
                ;; an HTTP-level error. The 422 path is for run-level errors.
                (let [assertions-json (json/encode
                                       [{:name "escapes_to_real_table"
                                         :sql  "SELECT * FROM products WHERE price < 0"
                                         :severity "error"}])
                      resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])
                             "assertions"             assertions-json})]
                  (testing "response is 200 (assertion error is a run result, not HTTP error)"
                    (is (= "failed" (:status resp))
                        "overall status is failed because the assertion has :failed status"))
                  (testing "assertion is :failed with an error_message"
                    (is (= "failed" (-> resp :assertions first :status)))
                    (is (string? (-> resp :assertions first :error_message)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 11.6 — no expected and no assertions → 400
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-no-expected-no-assertions-test
  (testing "POST /subgraph with no expected and no assertions → 400"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f orders-rows
                                    people-f people-rows]
                (mt/user-http-request
                 :crowberto :post 400 (subgraph-test-run-url (:id t2))
                 multipart-content-type
                 {(str "input-" orders-id) orders-f
                  (str "input-" people-id) people-f
                  "sources"                (json/encode [(:id t1)])})))))))))

;;; ---------------------------------------------------------------------------
;;; parse-assertions unit tests (no DB needed)
;;; ---------------------------------------------------------------------------

(deftest parse-assertions-empty-test
  (testing "nil part → empty vector"
    (is (= [] (api-util/parse-assertions nil))))
  (testing "empty array → empty vector"
    (is (= [] (api-util/parse-assertions "[]")))))

(deftest parse-assertions-valid-test
  (testing "valid assertions JSON → keyword severity"
    (let [json-str (json/encode [{:name "a" :sql "SELECT 1" :severity "error"}
                                 {:name "b" :sql "SELECT 2" :severity "warn"}
                                 {:name "c" :sql "SELECT 3"}])
          result   (api-util/parse-assertions json-str)]
      (is (= 3 (count result)))
      (is (= :error (:severity (first result))))
      (is (= :warn  (:severity (second result))))
      (is (= :error (:severity (nth result 2)))
          "missing severity defaults to :error"))))

(deftest parse-assertions-missing-name-test
  (testing "entry without name → 400"
    (is (thrown? clojure.lang.ExceptionInfo
                 (api-util/parse-assertions (json/encode [{:sql "SELECT 1"}]))))))

(deftest parse-assertions-missing-sql-test
  (testing "entry without sql → 400"
    (is (thrown? clojure.lang.ExceptionInfo
                 (api-util/parse-assertions (json/encode [{:name "a"}]))))))

(deftest parse-assertions-bad-severity-test
  (testing "unknown severity → 400"
    (is (thrown? clojure.lang.ExceptionInfo
                 (api-util/parse-assertions (json/encode [{:name "a" :sql "SELECT 1" :severity "critical"}]))))))

(deftest parse-assertions-malformed-json-test
  (testing "non-JSON string → 400"
    (is (thrown? clojure.lang.ExceptionInfo
                 (api-util/parse-assertions "not json at all")))))

;;; ===========================================================================
;;; Contract: cleanup! runs inside the transform connection context
;;; ===========================================================================

(deftest chain-cleanup-runs-inside-transform-connection-test
  ;; CONTRACT (documented in scratch.clj:29-34): every call to scratch/cleanup!
  ;; issued by run-chain-test! must occur while *connection-type* is bound to
  ;; :transform. On databases with separate write-data credentials the DROP TABLE
  ;; issued by cleanup! would run on read credentials if cleanup! fires after
  ;; with-transform-connection unwinds, leaking all scratch tables.
  ;;
  ;; The single-credential test DB makes this invisible at the table level; we
  ;; observe it by intercepting scratch/cleanup! and capturing *connection-type*
  ;; at each call, then asserting every capture equals :transform.
  (testing "all cleanup! calls occur inside with-transform-connection (success path)"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [schema        "public"
                mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                ;; Collect *connection-type* for every cleanup! call.
                ;; run-chain-test! issues N+1 calls: one per node output + one
                ;; for the leaf mapping. All must be :transform.
                captured      (atom [])]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (mt/with-dynamic-fn-redefs [scratch/cleanup!
                                          (fn [& args]
                                            (swap! captured conj @#'driver.conn/*connection-type*)
                                            (apply (mt/original-fn #'scratch/cleanup!) args))]
                (chain/run-chain-test!
                 (:id t2) #{(:id t1)}
                 {orders-id orders-rows people-id people-rows}
                 correct-expected-csv {})))
            (is (pos? (count @captured))
                "cleanup! should have been called at least once")
            (is (every? #{:transform} @captured)
                (str "every cleanup! call must see *connection-type* = :transform; "
                     "got: " (pr-str @captured)))))))))

;;; ===========================================================================
;;; Single-node subgraph: behaviors ported from the removed single-transform path
;;;
;;; All use run-chain-test! with source-ids=#{} (degenerate slice = {target}).
;;; The subgraph path with no sources is functionally identical to the old
;;; run-test! single-transform path; these tests prove coverage is preserved.
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; ignore_columns — single-node subgraph passes despite noisy column
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-ignore-columns-test
  (testing "run-chain-test! with sources=#{} and ignore_columns → :passed despite ts mismatch"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                before-scratch (count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp
                                             (str "SELECT user_id, COUNT(*) AS order_count, NOW() AS ts"
                                                  " FROM orders GROUP BY user_id ORDER BY user_id"))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              ;; orders-rows has 4 rows: user_ids 1,1,2,3 → COUNT(*) yields 3 groups.
              (let [result (chain/run-chain-test!
                            (:id t) #{}
                            {orders-id orders-rows}
                            ;; ts placeholder doesn't match NOW(), but :ignore-columns excludes it.
                            "user_id,order_count,ts\n1,2,1970-01-01T00:00:00Z\n2,1,1970-01-01T00:00:00Z\n3,1,1970-01-01T00:00:00Z\n"
                            {:ignore-columns #{"ts"}})]
                (testing "status is passed with ts ignored"
                  (is (= :passed (:status result))
                      (str "Expected :passed; diff: " (pr-str (:diff result)))))
                (testing "scratch tables cleaned up"
                  (is (= before-scratch (count-test-scratch-tables db-id schema))))))))))))

;;; ---------------------------------------------------------------------------
;;; seed! creates a missing target schema (single-node)
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-seed-creates-missing-target-schema-test
  (testing "single-node run-chain-test! seeds a transform whose target schema does not exist yet"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id        (mt/id)
                fresh-schema (str "ttr_" (mt/random-name))
                db           (t2/select-one :model/Database :id db-id)
                mp           (mt/metadata-provider)
                orders-id    (mt/id :orders)]
            (try
              (is (not (driver/schema-exists? :postgres db-id fresh-schema))
                  "precondition: fresh schema must not exist yet")
              (mt/with-temp [:model/Transform t
                             {:source {:type :query
                                       :query (lib/native-query
                                               mp
                                               "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id ORDER BY user_id")}
                              :target {:schema fresh-schema :type "table" :name (mt/random-name)}}]
                ;; orders-rows has user_ids 1,1,2,3 → 3 groups.
                (let [result (chain/run-chain-test!
                              (:id t) #{}
                              {orders-id orders-rows}
                              "user_id,order_count\n1,2\n2,1\n3,1\n" {})]
                  (is (= :passed (:status result))
                      (str "Expected :passed; got: " (pr-str result)))))
              (is (driver/schema-exists? :postgres db-id fresh-schema)
                  "seed! should have created the missing target schema")
              (is (zero? (count-test-scratch-tables db-id fresh-schema))
                  "no scratch tables should remain in the created schema")
              (finally
                (driver/execute-raw-queries!
                 :postgres (driver/connection-spec :postgres db)
                 [[(str "DROP SCHEMA IF EXISTS \"" fresh-schema "\" CASCADE")]])))))))))

;;; ---------------------------------------------------------------------------
;;; Timeout — single-node subgraph + pg_sleep timeout → cleanup still runs
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-timeout-test
  ;; Verifies that a statement timeout kills the query and propagates an exception.
  ;; In this case, the DROP may not have run, but `scratch/sweep-old-test-tables!`
  ;; will clean up later.
  (testing "single-node run-chain-test! with a pg_sleep transform → throws on timeout"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [schema      "public"
                mp          (mt/metadata-provider)
                orders-id   (mt/id :orders)
                before-runs (t2/count :model/TransformRun)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp
                                             "SELECT total FROM orders WHERE pg_sleep(10) IS NOT NULL")}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (let [threw? (try
                             (chain/run-chain-test!
                              (:id t) #{}
                              {orders-id (str orders-header "\n1,1,10,90,10,100.00,,2024-01-01T00:00:00Z,1\n")}
                              "total\n100.00\n"
                              {:timeout-ms 1000})
                             false
                             (catch Exception _ true))]
                (is threw? "Expected exception from pg_sleep timeout")
                (is (= before-runs (t2/count :model/TransformRun))
                    "No TransformRun row after timeout")))))))))

;;; ---------------------------------------------------------------------------
;;; read-back-output uses quoted identifiers (regression; tests execute.clj directly)
;;; ---------------------------------------------------------------------------

(deftest read-back-output-uses-quoted-identifiers-test
  ;; Regression: read-back-output was building SELECT * FROM <schema>.<table>
  ;; by string interpolation. A schema with a single quote produces malformed SQL.
  ;; Schema and table are identifiers, not values — they must be driver-quoted.
  (testing "read-back-output submits a SELECT with properly quoted schema.table identifiers"
    (let [captured-queries (atom [])
          fake-process     (fn [q]
                             (swap! captured-queries conj q)
                             {:status :completed
                              :data   {:cols [] :rows []}})]
      (with-redefs [qp.core/process-query fake-process]
        (mt/with-driver :postgres
          (#'test-run.execute/read-back-output
           999 :postgres {:schema "pub'lic" :table "mb_transform_temp_table_test_abc_xyz_out"})))
      (is (= 1 (count @captured-queries))
          "exactly one query submitted")
      (let [sql (get-in (first @captured-queries) [:native :query])]
        (is (not (re-find #"FROM pub'lic" sql))
            "raw interpolation of schema with quote must not appear in SQL")
        (is (re-find #"\"pub'lic\"" sql)
            "schema must be double-quote quoted (Postgres identifier quoting)")
        (is (string? sql)
            "SQL must be a string")))))

;;; ---------------------------------------------------------------------------
;;; Single-node subgraph via HTTP endpoint — specific behaviors not in chain tests
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-endpoint-ignore-columns-test
  (testing "POST /subgraph with sources=[] and ignore_columns → 200 passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp
                                             (str "SELECT user_id, COUNT(*) AS order_count, NOW() AS ts"
                                                  " FROM orders GROUP BY user_id ORDER BY user_id"))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-rows
                 ;; orders-rows has user_ids 1,1,2,3 → 3 groups; ts ignored.
                 expected-f "user_id,order_count,ts\n1,2,1970-01-01T00:00:00Z\n2,1,1970-01-01T00:00:00Z\n3,1,1970-01-01T00:00:00Z\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])
                             "options"                "{\"ignore_columns\":[\"ts\"]}"})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed with ts ignored; diff: " (pr-str (:diff resp))))))))))))))

(deftest subgraph-single-node-endpoint-cannot-test-run-422-test
  (testing "POST /subgraph with table-qualified-column SQL → 422 ::cannot-test-run"
    ;; SELECT orders.id FROM orders leaves the `orders.` qualifier dangling after
    ;; FROM-only rewrite, triggering guard 3 → ::cannot-test-run (422).
    ;; The resolve check fires after seed but before execution; scratch-table cleanup
    ;; on this error path is covered by chain-cleanup-runs-inside-transform-connection-test.
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT orders.id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-rows
                 expected-f "id\n1\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 422 (subgraph-test-run-url (:id t))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])})]
                  (testing "status is error"
                    (is (= "error" (:status resp))))
                  (testing "error type is cannot-test-run"
                    (is (= (pr-str :metabase.transforms.test-run.resolve/cannot-test-run)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-header-mismatch-400-test
  ;; Regression: ::fixtures/header-mismatch was missing from test-run-error-http-status.
  (testing "POST /subgraph with wrong CSV headers → 400 + error envelope (::fixtures/header-mismatch)"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   "wrong_col_a,wrong_col_b\n1,2\n"
                 expected-f "user_id,order_count\n1,1\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 400 (subgraph-test-run-url (:id t))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])})]
                  (testing "response status is error"
                    (is (= "error" (:status resp))
                        "header-mismatch must return error envelope, not 500"))
                  (testing "error type indicates header mismatch"
                    (is (= (pr-str :metabase.transforms.test-run.fixtures/header-mismatch)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-unknown-ignore-columns-400-test
  ;; Regression: ::diff/unknown-ignore-columns was missing from test-run-error-http-status.
  (testing "POST /subgraph with nonexistent ignore_columns → 400 + error envelope"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-rows
                 expected-f "user_id,order_count\n1,2\n2,1\n3,1\n4,1\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 400 (subgraph-test-run-url (:id t))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])
                             "options"                "{\"ignore_columns\":[\"nonexistent_col\"]}"})]
                  (testing "response status is error"
                    (is (= "error" (:status resp))
                        "unknown-ignore-columns must return error envelope, not 500"))
                  (testing "error type indicates unknown ignore columns"
                    (is (= (pr-str :metabase.transforms.test-run.diff/unknown-ignore-columns)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-malformed-options-json-400-test
  (testing "POST /subgraph with malformed options JSON → 400"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT user_id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-rows
                 expected-f "user_id\n1\n"]
                (mt/user-http-request
                 :crowberto :post 400 (subgraph-test-run-url (:id t))
                 multipart-content-type
                 {(str "input-" orders-id) orders-f
                  "expected"               expected-f
                  "sources"                (json/encode [])
                  "options"                "not-json!"})))))))))

(deftest subgraph-transform-target-permissions-403-test
  (testing "POST /subgraph for a transform target enforces read-check → 403 for non-admin"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Transform t {}]
        (with-temp-csv-files [expected-f "x\n1\n"]
          (mt/user-http-request
           :rasta :post 403 (subgraph-test-run-url (:id t))
           multipart-content-type
           {"expected" expected-f}))))))

(deftest subgraph-transform-target-feature-flag-402-test
  (testing "POST /subgraph for a transform target with feature disabled → 402"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Transform t
                         {:source {:type :query
                                   :query (lib/native-query mp "SELECT 1 AS x")}
                          :target {:schema "public" :type "table" :name (mt/random-name)}}]
            (with-temp-csv-files [expected-f "x\n1\n"]
              (mt/with-dynamic-fn-redefs
                [transforms.core/check-feature-enabled!
                 (fn [_] (throw (ex-info "Premium features required."
                                         {:status-code 402})))]
                (mt/user-http-request
                 :crowberto :post 402 (subgraph-test-run-url (:id t))
                 multipart-content-type
                 {"expected" expected-f})))))))))

(deftest subgraph-inputs-cannot-determine-inputs-422-test
  (testing "GET /subgraph-inputs — cannot-determine-inputs error → 422"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp (mt/metadata-provider)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT user_id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (mt/with-dynamic-fn-redefs
                [transforms.core/subgraph-input-tables
                 (fn [& _]
                   (throw (ex-info "Cannot determine inputs for this transform."
                                   {:error-type :metabase.transforms.test-run.inputs/cannot-determine-inputs})))]
                (let [resp (mt/user-http-request
                            :crowberto :get 422 (subgraph-inputs-url (:id t)))]
                  (testing "status is error"
                    (is (= "error" (:status resp))))
                  (testing "error type is cannot-determine-inputs"
                    (is (string? (get-in resp [:error :type])))
                    (is (str/includes? (get-in resp [:error :type]) "cannot-determine-inputs"))))))))))))

(deftest subgraph-inputs-permissions-403-test
  (testing "GET /subgraph-inputs — user without read access → 403"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Transform t {}]
        (mt/user-http-request
         :rasta :get 403 (subgraph-inputs-url (:id t)))))))

(deftest subgraph-inputs-feature-flag-402-test
  (testing "GET /subgraph-inputs — feature not enabled → 402"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Transform t
                         {:source {:type :query
                                   :query (lib/native-query mp "SELECT 1 AS x")}
                          :target {:schema "public" :type "table" :name (mt/random-name)}}]
            (mt/with-dynamic-fn-redefs
              [transforms.core/check-feature-enabled!
               (fn [_] (throw (ex-info "Premium features required."
                                       {:status-code 402})))]
              (mt/user-http-request
               :crowberto :get 402 (subgraph-inputs-url (:id t))))))))))
