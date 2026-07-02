(ns ^:mb/driver-tests metabase-enterprise.transforms-test.chain-test
  "End-to-end tests for the chained (sub-graph) test-run orchestrator
  ([[metabase-enterprise.transforms-test.chain/run-chain-test!]]) and the generalized HTTP
  endpoints (`POST /api/ee/transform-test/:target-type/:id/subgraph`,
  `GET /api/ee/transform-test/:target-type/:id/subgraph-inputs`).

  Builds a 2-node native chain on the test-data schema (see
  [[metabase-enterprise.transforms-test.test-util]] for the shared fixtures):

    t1 (enrich): orders ⋈ people → <enriched>   (per-order rows with state, total)
    t2 (target): <enriched> → aggregate count/revenue by state

  Selecting source {t1} + target {t2} makes the slice {t1, t2} with leaves
  {orders, people}; the executor seeds the two leaves, runs t1 into a scratch
  table, redirects t2's reference to t1's output (accumulating remap), runs t2,
  and diffs t2's output against the expected CSV."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-test.api.util :as api-util]
   [metabase-enterprise.transforms-test.chain :as chain]
   [metabase-enterprise.transforms-test.core :as test-run.core]
   [metabase-enterprise.transforms-test.execute :as test-run.execute]
   [metabase-enterprise.transforms-test.scratch :as scratch]
   [metabase-enterprise.transforms-test.test-util :as tu :refer [with-temp-csv-files]]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt]
   [metabase.transforms-rest.api.transform]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; The chain under test — shared scaffolding
;;; ---------------------------------------------------------------------------

(defn- do-with-t1-t2-chain [f]
  (mt/with-premium-features #{:dependencies}
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [enriched-name (mt/random-name)
              target-name   (mt/random-name)
              mp            (mt/metadata-provider)]
          (mt/with-temp [:model/Transform t1
                         {:source {:type :query :query (lib/native-query mp tu/enrich-sql)}
                          :target {:schema "public" :type "table" :name enriched-name}}
                         :model/Transform t2
                         {:source {:type :query :query (lib/native-query mp (tu/aggregate-sql enriched-name))}
                          :target {:schema "public" :type "table" :name target-name}}]
            (f {:t1            t1
                :t2            t2
                :db-id         (mt/id)
                :schema        "public"
                :orders-id     (mt/id :orders)
                :people-id     (mt/id :people)
                :enriched-name enriched-name
                :target-name   target-name})))))))

(defmacro ^:private with-t1-t2-chain
  "Run `body` inside the standard 2-node chain scaffolding: `:dependencies`
  premium feature, `:postgres` driver, `test-data` dataset, temp t1/t2 transforms.
  `ctx-binding` destructures the context map
  `{:t1 :t2 :db-id :schema :orders-id :people-id :enriched-name :target-name}`."
  [[ctx-binding] & body]
  `(do-with-t1-t2-chain (fn [~ctx-binding] ~@body)))

;;; ===========================================================================
;;; Passed: full native chain (source t1 → target t2)
;;; ===========================================================================

(deftest chain-native-passed-test
  (testing "2-node native chain runs end-to-end and passes against the correct expected CSV"
    (with-t1-t2-chain [{:keys [t1 t2 db-id schema orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id schema)
            before-runs    (t2/count :model/TransformRun)
            result         (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            tu/correct-expected-csv {}
                            (t2/select :model/Transform))]
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
          (is (= before-scratch (tu/count-test-scratch-tables db-id schema))))
        (testing "no TransformRun row created"
          (is (= before-runs (t2/count :model/TransformRun))))))))

;;; ===========================================================================
;;; Failed: wrong expected value triggers a diff mismatch
;;; ===========================================================================

(deftest chain-native-failed-test
  (testing "wrong expected CA count → failed with a named diff, scratch still cleaned"
    (with-t1-t2-chain [{:keys [t1 t2 db-id schema orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id schema)
            result         (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            tu/wrong-expected-csv {}
                            (t2/select :model/Transform))]
        (testing "status is failed"
          (is (= :failed (:status result))))
        (testing "diff pins the CA mismatch: one missing row, one extra row, one cell mismatch"
          ;; Expected CA count is 9, actual is 3 → the CA row appears once as
          ;; missing (expected-only) and once as extra (actual-only), paired
          ;; into a single order_count cell mismatch. The revenue cell's display
          ;; string depends on the warehouse numeric type, so compare it by value.
          (let [{:keys [missing-rows extra-rows cell-mismatches]} (:diff result)]
            (is (= 1 (count missing-rows)))
            (is (= 1 (count extra-rows)))
            (let [[m-state m-count m-revenue] (first missing-rows)
                  [e-state e-count e-revenue] (first extra-rows)]
              (is (= ["CA" "9"] [m-state m-count]))
              (is (= ["CA" "3"] [e-state e-count]))
              (is (zero? (compare 180M (bigdec m-revenue))))
              (is (zero? (compare 180M (bigdec e-revenue)))))
            (is (= [{:column             "order_count"
                     :actual-canonical   "3"
                     :expected-canonical "9"}]
                   cell-mismatches))))
        (testing "scratch cleaned up even on a failed diff"
          (is (= before-scratch (tu/count-test-scratch-tables db-id schema))))))))

;;; ===========================================================================
;;; HTTP endpoints: GET subgraph-inputs + POST subgraph
;;; ===========================================================================

(deftest subgraph-inputs-endpoint-test
  (testing "GET subgraph-inputs returns the leaf input tables for (target, sources)"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id]}]
      (let [resp (mt/user-http-request :crowberto :get 200 (tu/subgraph-inputs-url (:id t2))
                                       :sources (:id t1))]
        (testing "both leaf tables (orders, people) are returned"
          (is (= #{orders-id people-id} (set (map :table_id resp)))))
        (testing "each descriptor carries schema, name, and column headers"
          (is (every? (fn [d] (and (string? (:schema d))
                                   (string? (:name d))
                                   (seq (:columns d))))
                      resp)))))))

(deftest subgraph-test-run-endpoint-passed-test
  (testing "POST subgraph runs the chain and returns 200 passed"
    (with-t1-t2-chain [{:keys [t1 t2 db-id schema orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id schema)]
        (with-temp-csv-files [orders-f   tu/orders-rows
                              people-f   tu/people-rows
                              expected-f tu/correct-expected-csv]
          (let [resp (mt/user-http-request
                      :crowberto :post 200 (tu/subgraph-test-run-url (:id t2))
                      tu/multipart-content-type
                      {(str "input-" orders-id) orders-f
                       (str "input-" people-id) people-f
                       "expected"               expected-f
                       "sources"                (json/encode [(:id t1)])})]
            (testing "status is passed"
              (is (= "passed" (:status resp))
                  (str "Expected passed; body: " (pr-str resp))))
            (testing "no scratch tables remain"
              (is (= before-scratch (tu/count-test-scratch-tables db-id schema))))))))))

(deftest subgraph-test-run-endpoint-bad-source-test
  (testing "POST subgraph with a source that does not feed the target → 400 error envelope"
    (with-t1-t2-chain [{:keys [t2 orders-id people-id]}]
      ;; t3 is unrelated — reads orders only, does not feed t2.
      (mt/with-temp [:model/Transform t3
                     {:source {:type :query :query (lib/native-query (mt/metadata-provider)
                                                                     "SELECT id FROM orders")}
                      :target {:schema "public" :type "table" :name (mt/random-name)}}]
        (with-temp-csv-files [orders-f   tu/orders-rows
                              people-f   tu/people-rows
                              expected-f tu/correct-expected-csv]
          (let [resp (mt/user-http-request
                      :crowberto :post 400 (tu/subgraph-test-run-url (:id t2))
                      tu/multipart-content-type
                      {(str "input-" orders-id) orders-f
                       (str "input-" people-id) people-f
                       "expected"               expected-f
                       "sources"                (json/encode [(:id t3)])})]
            (testing "error envelope is returned"
              (is (= "error" (:status resp)))
              (is (string? (get-in resp [:error :message]))))))))))

;;; ===========================================================================
;;; HTTP endpoints: card target (generalized /api/ee/transform-test/card/…)
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
                    {:source          {:type :query :query (lib/native-query mp# tu/enrich-sql)}
                     :target          {:schema "public" :type "table" :name enriched-name#}
                     :target_table_id (:id tbl#)}
                    :model/Card ~card-sym
                    {:dataset_query {:database db-id# :type "native"
                                     :native   {:query (tu/aggregate-sql enriched-name#)}}}]
       ~@body)))

(deftest card-subgraph-inputs-endpoint-test
  (testing "GET card subgraph-inputs returns the card's boundary leaf tables"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-card [t1 card]
              (let [resp (mt/user-http-request :crowberto :get 200 (tu/card-subgraph-inputs-url (:id card))
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
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id schema)]
            (with-enrich-card [t1 card]
              (with-temp-csv-files [orders-f   tu/orders-rows
                                    people-f   tu/people-rows
                                    expected-f tu/correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/card-subgraph-test-run-url (:id card))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (tu/count-test-scratch-tables db-id schema)))))))))))))

;;; ---------------------------------------------------------------------------
;;; Native card, failed case (endpoint)
;;; ---------------------------------------------------------------------------

(deftest card-subgraph-test-run-endpoint-failed-test
  (testing "POST card subgraph with wrong expected CSV → 200 failed"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-card [t1 card]
              (with-temp-csv-files [orders-f   tu/orders-rows
                                    people-f   tu/people-rows
                                    expected-f tu/wrong-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/card-subgraph-test-run-url (:id card))
                            tu/multipart-content-type
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
;;; back.
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
                      {:source          {:type :query :query (lib/native-query mp# tu/enrich-sql)}
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
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-mbql-card [t1 card]
              (let [resp (mt/user-http-request :crowberto :get 200 (tu/card-subgraph-inputs-url (:id card))
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
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id "public")]
            (with-enrich-mbql-card [t1 card]
              (with-temp-csv-files [orders-f   tu/orders-rows
                                    people-f   tu/people-rows
                                    expected-f mbql-card-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/card-subgraph-test-run-url (:id card))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (tu/count-test-scratch-tables db-id "public")))))))))))))

(deftest card-mbql-subgraph-test-run-endpoint-failed-test
  (testing "POST card/subgraph for a stored MBQL card with wrong expected CSV → 200 failed"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id "public")]
            (with-enrich-mbql-card [t1 card]
              (with-temp-csv-files [orders-f   tu/orders-rows
                                    people-f   tu/people-rows
                                    expected-f mbql-card-wrong-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/card-subgraph-test-run-url (:id card))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is failed"
                    (is (= "failed" (:status resp))
                        (str "Expected failed; body: " (pr-str resp))))
                  (testing "no scratch tables remain even on failure"
                    (is (= before-scratch (tu/count-test-scratch-tables db-id "public")))))))))))))

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
           :rasta :post 403 (tu/card-subgraph-test-run-url (:id card))
           tu/multipart-content-type
           {"expected" expected-f}))))))

(deftest unknown-target-type-rejected-test
  (testing "unrecognised target-type returns 404 (metric cards use target-type=card)"
    (is (= "API endpoint does not exist."
           (mt/user-http-request :crowberto :get 404 "ee/transform-test/metric/1/subgraph-inputs")))))

;;; ===========================================================================
;;; Assertions wired into run-chain-test! and run-card-chain-test!
;;;
;;; All tests run on :postgres with the standard test-data chain (t1 → t2).
;;; Assertion SQL is written against the real table names (orders, people,
;;; t2's real output table) — the harness remaps them to scratch at run time.
;;; The `test_output` alias is also exercised.
;;; ===========================================================================

(deftest chain-assertion-cases-test
  ;; One standard chain run per case. `assertion-sql` builds the assertion from
  ;; t2's real output table name (or ignores it and uses the test_output alias).
  (doseq [{:keys [desc assertion-sql severity expected-csv overall
                  assertion-status rows-check diff-nil?]}
          [{:desc             "passing assertion → :passed, zero failing rows"
            :assertion-sql    (fn [target] (str "SELECT * FROM " target " WHERE revenue < 0"))
            :severity         :error
            :expected-csv     tu/correct-expected-csv
            :overall          :passed
            :assertion-status :passed
            :rows-check       :zero}
           {:desc             "failing assertion → :failed, positive failing_row_count"
            ;; SELECT * FROM <target> returns rows → always fails
            :assertion-sql    (fn [target] (str "SELECT * FROM " target))
            :severity         :error
            :expected-csv     tu/correct-expected-csv
            :overall          :failed
            :assertion-status :failed
            :rows-check       :pos}
           {:desc             "warn-severity failing assertion → overall :passed, assertion :warn"
            :assertion-sql    (fn [target] (str "SELECT * FROM " target))
            :severity         :warn
            :expected-csv     tu/correct-expected-csv
            :overall          :passed
            :assertion-status :warn
            :rows-check       :pos}
           {:desc             "no expected CSV, assertions only → :passed, :diff nil"
            :assertion-sql    (fn [target] (str "SELECT * FROM " target " WHERE revenue < 0"))
            :severity         :error
            :expected-csv     nil
            :overall          :passed
            :assertion-status :passed
            :diff-nil?        true}
           {:desc             "test_output alias instead of the real table name"
            :assertion-sql    (fn [_target] "SELECT * FROM test_output WHERE revenue < 0")
            :severity         :error
            :expected-csv     tu/correct-expected-csv
            :overall          :passed
            :assertion-status :passed}]]
    (testing desc
      (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id target-name]}]
        (let [result (chain/run-chain-test!
                      (:id t2) #{(:id t1)}
                      {orders-id tu/orders-rows people-id tu/people-rows}
                      expected-csv
                      {:assertions [{:name     "case_assertion"
                                     :sql      (assertion-sql target-name)
                                     :severity severity}]}
                      (t2/select :model/Transform))]
          (testing "overall status"
            (is (= overall (:status result))))
          (testing ":assertions is a single-entry vector"
            (is (= 1 (count (:assertions result)))))
          (testing "assertion status"
            (is (= assertion-status (get-in result [:assertions 0 :status]))))
          (case rows-check
            :zero (testing "failing_row_count is 0"
                    (is (zero? (get-in result [:assertions 0 :failing_row_count]))))
            :pos  (testing "failing_row_count > 0"
                    (is (pos? (get-in result [:assertions 0 :failing_row_count]))))
            nil)
          (when diff-nil?
            (testing ":diff is nil when no expected CSV"
              (is (nil? (:diff result))))))))))

;;; ---------------------------------------------------------------------------
;;; card target, assertions via :cte binding (no extra scratch table)
;;; ---------------------------------------------------------------------------

(deftest card-chain-assertion-cte-binding-test
  (testing "run-card-chain-test! with assertions via CTE binding — no extra scratch table"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id "public")]
            (with-enrich-card [t1 card]
              (let [result (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            tu/correct-expected-csv
                            {:assertions [{:name "result_nonneg_revenue"
                                           ;; test_output refers to the card's compiled SQL CTE
                                           :sql  "SELECT * FROM test_output WHERE revenue < 0"
                                           :severity :error}]}
                            (t2/select :model/Transform))]
                (testing "overall status is :passed"
                  (is (= :passed (:status result))))
                (testing "assertion status is :passed"
                  (is (= :passed (get-in result [:assertions 0 :status]))))
                (testing "no extra scratch tables remain (CTE binding creates no tables)"
                  (is (= before-scratch (tu/count-test-scratch-tables db-id "public"))))))))))))

;;; ===========================================================================
;;; HTTP endpoint wires assertions
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; assertions=[] → same response shape
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-empty-assertions-test
  (testing "POST /subgraph with assertions=[] → 200 passed"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id]}]
      (with-temp-csv-files [orders-f   tu/orders-rows
                            people-f   tu/people-rows
                            expected-f tu/correct-expected-csv]
        (let [resp (mt/user-http-request
                    :crowberto :post 200 (tu/subgraph-test-run-url (:id t2))
                    tu/multipart-content-type
                    {(str "input-" orders-id) orders-f
                     (str "input-" people-id) people-f
                     "expected"               expected-f
                     "sources"                (json/encode [(:id t1)])
                     "assertions"             (json/encode [])})]
          (testing "status is passed"
            (is (= "passed" (:status resp))))
          (testing "assertions key is nil (no assertions run)"
            (is (nil? (:assertions resp)))))))))

;;; ---------------------------------------------------------------------------
;;; assertions + no expected → 200 + assertion results
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertions-no-expected-test
  (testing "POST /subgraph with assertions and no expected → 200, :assertions in response"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id target-name]}]
      (with-temp-csv-files [orders-f tu/orders-rows
                            people-f tu/people-rows]
        (let [assertions-json (json/encode
                               [{:name "revenue_nonneg"
                                 :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                 :severity "error"}])
              resp (mt/user-http-request
                    :crowberto :post 200 (tu/subgraph-test-run-url (:id t2))
                    tu/multipart-content-type
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
            (is (= "passed" (-> resp :assertions first :status)))))))))

;;; ---------------------------------------------------------------------------
;;; assertions + expected → 200 + diff + assertions
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertions-and-expected-test
  (testing "POST /subgraph with assertions AND expected → 200, both :diff and :assertions"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id target-name]}]
      (with-temp-csv-files [orders-f   tu/orders-rows
                            people-f   tu/people-rows
                            expected-f tu/correct-expected-csv]
        (let [assertions-json (json/encode
                               [{:name "no_negative"
                                 :sql  (str "SELECT * FROM " target-name " WHERE revenue < 0")
                                 :severity "error"}])
              resp (mt/user-http-request
                    :crowberto :post 200 (tu/subgraph-test-run-url (:id t2))
                    tu/multipart-content-type
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
            (is (= "passed" (-> resp :assertions first :status)))))))))

;;; ---------------------------------------------------------------------------
;;; malformed assertions JSON → 400
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-malformed-assertions-test
  (testing "POST /subgraph with malformed assertions JSON → 400"
    (with-t1-t2-chain [{:keys [t2]}]
      (with-temp-csv-files [expected-f tu/correct-expected-csv]
        ;; Send invalid JSON as the assertions part.
        (mt/user-http-request
         :crowberto :post 400 (tu/subgraph-test-run-url (:id t2))
         tu/multipart-content-type
         {"expected"   expected-f
          "assertions" "this is not json"})))))

;;; ---------------------------------------------------------------------------
;;; assertion referencing a real table → 200
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-assertion-real-table-reference-test
  (testing "POST /subgraph with assertion referencing a real (non-scratch) table → 200 with :failed assertion"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id]}]
      (with-temp-csv-files [orders-f   tu/orders-rows
                            people-f   tu/people-rows
                            expected-f tu/correct-expected-csv]
        ;; products is a real table not in the mapping: terminal assertion failure
        (let [assertions-json (json/encode
                               [{:name "escapes_to_real_table"
                                 :sql  "SELECT * FROM products WHERE price < 0"
                                 :severity "error"}])
              resp (mt/user-http-request
                    :crowberto :post 200 (tu/subgraph-test-run-url (:id t2))
                    tu/multipart-content-type
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
            (is (string? (-> resp :assertions first :error_message)))))))))

;;; ---------------------------------------------------------------------------
;;; no expected and no assertions → 400
;;; ---------------------------------------------------------------------------

(deftest subgraph-endpoint-no-expected-no-assertions-test
  (testing "POST /subgraph with no expected and no assertions → 400"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id]}]
      (with-temp-csv-files [orders-f tu/orders-rows
                            people-f tu/people-rows]
        (mt/user-http-request
         :crowberto :post 400 (tu/subgraph-test-run-url (:id t2))
         tu/multipart-content-type
         {(str "input-" orders-id) orders-f
          (str "input-" people-id) people-f
          "sources"                (json/encode [(:id t1)])})))))

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
  ;; Every scratch/cleanup! call from run-chain-test! must run while
  ;; *connection-type* is bound to :transform. On databases with separate
  ;; write-data credentials, a cleanup! that fires after with-transform-connection
  ;; unwinds would issue its DROP TABLE on read credentials, leaking scratch tables.
  ;;
  ;; The single-credential test DB makes this invisible at the table level; we
  ;; observe it by intercepting scratch/cleanup! and capturing *connection-type*
  ;; at each call, then asserting every capture equals :transform.
  (testing "all cleanup! calls occur inside with-transform-connection (success path)"
    (with-t1-t2-chain [{:keys [t1 t2 orders-id people-id]}]
      ;; Collect *connection-type* for every cleanup! call. run-chain-test!
      ;; issues N+1 calls: one per node output + one for the leaf mapping.
      (let [captured (atom [])]
        (mt/with-dynamic-fn-redefs [scratch/cleanup!
                                    (fn [& args]
                                      (swap! captured conj @#'driver.conn/*connection-type*)
                                      (apply (mt/original-fn #'scratch/cleanup!) args))]
          (chain/run-chain-test!
           (:id t2) #{(:id t1)}
           {orders-id tu/orders-rows people-id tu/people-rows}
           tu/correct-expected-csv {}
           (t2/select :model/Transform)))
        (is (pos? (count @captured))
            "cleanup! should have been called at least once")
        (is (every? #{:transform} @captured)
            (str "every cleanup! call must see *connection-type* = :transform; "
                 "got: " (pr-str @captured)))))))

;;; ===========================================================================
;;; Mid-slice failure: cleanup must cover partial state
;;; ===========================================================================

(deftest mid-slice-failure-cleans-up-scratch-test
  ;; t2's execution fails after the leaves are seeded and t1 has run; the
  ;; `finally` must still drop every scratch table created so far (leaves,
  ;; t1's output, and t2's registered-but-failed output).
  (testing "a node failing mid-slice leaves no scratch tables behind"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (tu/count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp tu/enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp
                                             ;; No such column in t1's output → t2's CTAS
                                             ;; fails at the warehouse, mid-slice.
                                             (str "SELECT no_such_column FROM " enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (is (thrown? Exception
                           (chain/run-chain-test!
                            (:id t2) #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            nil
                            {:assertions [{:name     "never_runs"
                                           :sql      "SELECT * FROM test_output"
                                           :severity :error}]}
                            (t2/select :model/Transform))))
              (testing "no scratch tables remain after the mid-slice failure"
                (is (= before-scratch (tu/count-test-scratch-tables db-id schema)))))))))))

;;; ===========================================================================
;;; Single-node subgraph: source-ids=#{} (degenerate slice = {target})
;;;
;;; run-chain-test! with no sources runs just the target node.
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; ignore_columns — single-node subgraph passes despite noisy column
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-ignore-columns-test
  (testing "run-chain-test! with sources=#{} and ignore_columns → :passed despite ts mismatch"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                before-scratch (tu/count-test-scratch-tables db-id schema)]
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
                            {orders-id tu/orders-rows}
                            ;; ts placeholder doesn't match NOW(), but :ignore-columns excludes it.
                            "user_id,order_count,ts\n1,2,1970-01-01T00:00:00Z\n2,1,1970-01-01T00:00:00Z\n3,1,1970-01-01T00:00:00Z\n"
                            {:ignore-columns #{"ts"}}
                            (t2/select :model/Transform))]
                (testing "status is passed with ts ignored"
                  (is (= :passed (:status result))
                      (str "Expected :passed; diff: " (pr-str (:diff result)))))
                (testing "scratch tables cleaned up"
                  (is (= before-scratch (tu/count-test-scratch-tables db-id schema))))))))))))

;;; ---------------------------------------------------------------------------
;;; seed! creates a missing target schema (single-node)
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-seed-creates-missing-target-schema-test
  (testing "single-node run-chain-test! seeds a transform whose target schema does not exist yet"
    (mt/with-premium-features #{:dependencies}
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
                              {orders-id tu/orders-rows}
                              "user_id,order_count\n1,2\n2,1\n3,1\n" {}
                              (t2/select :model/Transform))]
                  (is (= :passed (:status result))
                      (str "Expected :passed; got: " (pr-str result)))))
              (is (driver/schema-exists? :postgres db-id fresh-schema)
                  "seed! should have created the missing target schema")
              (is (zero? (tu/count-test-scratch-tables db-id fresh-schema))
                  "no scratch tables should remain in the created schema")
              (finally
                (driver/execute-raw-queries!
                 :postgres (driver/connection-spec :postgres db)
                 [[(str "DROP SCHEMA IF EXISTS \"" fresh-schema "\" CASCADE")]])))))))))

;;; ---------------------------------------------------------------------------
;;; Timeout — single-node subgraph + pg_sleep timeout → cleanup still runs
;;; ---------------------------------------------------------------------------

(deftest subgraph-single-node-timeout-test
  ;; Verifies that a statement timeout kills the query and propagates an exception,
  ;; and that the `finally` cleanup still drops the scratch tables created before
  ;; the failure.
  (testing "single-node run-chain-test! with a pg_sleep transform → throws on timeout"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                before-runs    (t2/count :model/TransformRun)
                before-scratch (tu/count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query
                                             mp
                                             ;; sleep must comfortably exceed the 1 s timeout
                                             ;; (setQueryTimeout is whole-second granularity, so
                                             ;; 1000 ms is the smallest enforceable value); if the
                                             ;; timeout were a no-op the query would *succeed*
                                             ;; after 3 s and no exception would be thrown at all.
                                             "SELECT total FROM orders WHERE pg_sleep(3) IS NOT NULL")}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)cancel|timeout"
                                    (chain/run-chain-test!
                                     (:id t) #{}
                                     {orders-id (str tu/orders-header "\n1,1,10,90,10,100.00,,2024-01-01T00:00:00Z,1\n")}
                                     "total\n100.00\n"
                                     {:timeout-ms 1000}
                                     (t2/select :model/Transform)))
                  "Expected a statement-cancellation exception from the pg_sleep timeout")
              (is (= before-scratch (tu/count-test-scratch-tables db-id schema))
                  "scratch tables must be dropped even when the node times out")
              (is (= before-runs (t2/count :model/TransformRun))
                  "No TransformRun row after timeout"))))))))

;;; ---------------------------------------------------------------------------
;;; read-back-output uses quoted identifiers
;;; ---------------------------------------------------------------------------

(deftest read-back-output-uses-quoted-identifiers-test
  ;; Schema and table are identifiers, not values — they must be driver-quoted;
  ;; a schema containing a single quote would otherwise produce malformed SQL.
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
    (mt/with-premium-features #{:dependencies}
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
                [orders-f   tu/orders-rows
                 ;; orders-rows has user_ids 1,1,2,3 → 3 groups; ts ignored.
                 expected-f "user_id,order_count,ts\n1,2,1970-01-01T00:00:00Z\n2,1,1970-01-01T00:00:00Z\n3,1,1970-01-01T00:00:00Z\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/subgraph-test-run-url (:id t))
                            tu/multipart-content-type
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
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT orders.id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   tu/orders-rows
                 expected-f "id\n1\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 422 (tu/subgraph-test-run-url (:id t))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])})]
                  (testing "status is error"
                    (is (= "error" (:status resp))))
                  (testing "error type is cannot-test-run"
                    (is (= (pr-str :metabase-enterprise.transforms-test.errors/cannot-test-run)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-header-mismatch-400-test
  (testing "POST /subgraph with wrong CSV headers → 400 + error envelope (::errors/header-mismatch)"
    (mt/with-premium-features #{:dependencies}
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
                            :crowberto :post 400 (tu/subgraph-test-run-url (:id t))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])})]
                  (testing "response status is error"
                    (is (= "error" (:status resp))
                        "header-mismatch must return error envelope, not 500"))
                  (testing "error type indicates header mismatch"
                    (is (= (pr-str :metabase-enterprise.transforms-test.errors/header-mismatch)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-unknown-ignore-columns-400-test
  (testing "POST /subgraph with nonexistent ignore_columns → 400 + error envelope"
    (mt/with-premium-features #{:dependencies}
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
                [orders-f   tu/orders-rows
                 expected-f "user_id,order_count\n1,2\n2,1\n3,1\n4,1\n"]
                (let [resp (mt/user-http-request
                            :crowberto :post 400 (tu/subgraph-test-run-url (:id t))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             "expected"               expected-f
                             "sources"                (json/encode [])
                             "options"                "{\"ignore_columns\":[\"nonexistent_col\"]}"})]
                  (testing "response status is error"
                    (is (= "error" (:status resp))
                        "unknown-ignore-columns must return error envelope, not 500"))
                  (testing "error type indicates unknown ignore columns"
                    (is (= (pr-str :metabase-enterprise.transforms-test.errors/unknown-ignore-columns)
                           (get-in resp [:error :type])))))))))))))

(deftest subgraph-endpoint-malformed-options-json-400-test
  (testing "POST /subgraph with malformed options JSON → 400"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp        (mt/metadata-provider)
                orders-id (mt/id :orders)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT user_id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   tu/orders-rows
                 expected-f "user_id\n1\n"]
                (mt/user-http-request
                 :crowberto :post 400 (tu/subgraph-test-run-url (:id t))
                 tu/multipart-content-type
                 {(str "input-" orders-id) orders-f
                  "expected"               expected-f
                  "sources"                (json/encode [])
                  "options"                "not-json!"})))))))))

(deftest subgraph-transform-target-permissions-403-test
  (testing "POST /subgraph for a transform target enforces read-check → 403 for non-admin"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform t {}]
        (with-temp-csv-files [expected-f "x\n1\n"]
          (mt/user-http-request
           :rasta :post 403 (tu/subgraph-test-run-url (:id t))
           tu/multipart-content-type
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
                 :crowberto :post 402 (tu/subgraph-test-run-url (:id t))
                 tu/multipart-content-type
                 {"expected" expected-f})))))))))

(deftest subgraph-inputs-cannot-determine-inputs-422-test
  (testing "GET /subgraph-inputs — cannot-determine-inputs error → 422"
    (mt/with-premium-features #{:dependencies}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp (mt/metadata-provider)]
            (mt/with-temp [:model/Transform t
                           {:source {:type :query
                                     :query (lib/native-query mp "SELECT user_id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (mt/with-dynamic-fn-redefs
                [test-run.core/subgraph-input-tables
                 (fn [& _]
                   (throw (ex-info "Cannot determine inputs for this transform."
                                   {:error-type :metabase-enterprise.transforms-test.errors/cannot-determine-inputs})))]
                (let [resp (mt/user-http-request
                            :crowberto :get 422 (tu/subgraph-inputs-url (:id t)))]
                  (testing "status is error"
                    (is (= "error" (:status resp))))
                  (testing "error type is cannot-determine-inputs"
                    (is (string? (get-in resp [:error :type])))
                    (is (str/includes? (get-in resp [:error :type]) "cannot-determine-inputs"))))))))))))

(deftest subgraph-inputs-permissions-403-test
  (testing "GET /subgraph-inputs — user without read access → 403"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform t {}]
        (mt/user-http-request
         :rasta :get 403 (tu/subgraph-inputs-url (:id t)))))))

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
               :crowberto :get 402 (tu/subgraph-inputs-url (:id t))))))))))

(deftest subgraph-requires-dependencies-feature-402-test
  (testing "POST /subgraph — the :dependencies capability gate rejects with 402 for both target types"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (with-enrich-card [t1 card]
            (with-temp-csv-files [expected-f tu/correct-expected-csv]
              (testing "transform target"
                (mt/user-http-request
                 :crowberto :post 402 (tu/subgraph-test-run-url (:id t1))
                 tu/multipart-content-type {"expected" expected-f}))
              (testing "card target"
                (mt/user-http-request
                 :crowberto :post 402 (tu/card-subgraph-test-run-url (:id card))
                 tu/multipart-content-type {"expected" expected-f})))))))))
