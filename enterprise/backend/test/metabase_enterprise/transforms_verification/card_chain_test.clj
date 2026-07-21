(ns ^:mb/driver-tests metabase-enterprise.transforms-verification.card-chain-test
  "End-to-end tests for the card-target chained test-run orchestrator
  ([[metabase-enterprise.transforms-verification.chain/run-card-chain-test!]]).

  ## Test topology

  All tests use a 1-node chain over the test-data schema:

    t1 (enrich): orders ⋈ people → enriched   (per-order rows: total, state)

  The card target reads from `enriched` — t1's output table, registered in the
  app DB as a `:model/Table` row so `card->tables` can resolve it and
  `producer-of {:table enriched-id}` returns t1-id: a card referencing a synced
  table produced by a transform.

  ### Native-card path

  The native card queries `enriched` by name:

    SELECT state, COUNT(*) AS order_count, SUM(total) AS revenue
    FROM enriched GROUP BY state ORDER BY state

  Under the scratch override, `FROM enriched` is rewritten to the scratch output
  table produced by t1; verify confirms no real table ref survives.

  ### MBQL-card path

  The MBQL card is built with `source-table = enriched-table-id` so `qp.compile`
  emits `FROM enriched`. The `override-provider` overrides `enriched`'s
  `:name`/`:schema` in the metadata provider to the scratch spec — the compiler
  then emits scratch-qualified SQL, which verify confirms. Field rows are created on
  the temp Table so the MBQL metadata provider can build a valid query stage.

  ## Test matrix
  - Native card over enriched: passed / failed
  - MBQL card over enriched: passed / failed
  - `ignore_columns` honored (native)
  - Safety: card referencing an unmapped real table → verify fails closed
  - Cleanup: all cleanup! calls occur inside with-transform-connection
  - card-subgraph-input-tables returns the correct leaf descriptors"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.chain :as chain]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; t1 (enrich): orders ⋈ people → enriched (total, state columns)
;;;
;;; t1's output becomes the card's source table. The card aggregates over it.
;;; Shared fixtures ([[tu/orders-rows]], [[tu/people-rows]], [[tu/enrich-sql]],
;;; expected CSVs) live in [[metabase-enterprise.transforms-verification.test-util]].
;;; CA: 3 orders, total 180.  TX: 1 order, total 200.
;;; ---------------------------------------------------------------------------

(defn- native-agg-card
  "A card that aggregates enriched into (state, count, revenue).
  Under the scratch override, FROM enriched is rewritten to t1's scratch output."
  [db-id enriched-name]
  {:id            nil
   :dataset_query (lib/native-query (lib-be/application-database-metadata-provider db-id)
                                    (str "SELECT state,"
                                         " count(*) AS order_count,"
                                         " sum(total) AS revenue"
                                         " FROM " enriched-name
                                         " GROUP BY state ORDER BY state"))})

(defn- mbql-count-card
  "An MBQL card that counts rows in enriched — `SELECT COUNT(*) FROM enriched`.

  The source table is `tbl-id` (the app-DB Table id of the enriched temp table),
  so the MBQL compile path overrides enriched's `:name`/`:schema` to t1's scratch
  output spec and emits scratch-qualified SQL."
  [db-id tbl-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    {:id            nil
     :dataset_query (-> (lib/query mp (lib.metadata/table mp tbl-id))
                        (lib/aggregate (lib/count)))}))

(defn- do-with-card-chain [f]
  (mt/with-premium-features #{}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [enriched-name (mt/random-name)
              db-id         (mt/id)
              mp            (mt/metadata-provider)]
          (mt/with-temp [:model/Table tbl
                         {:db_id  db-id :schema (tu/test-schema)
                          :name   enriched-name :active true}
                         :model/Field _total
                         {:table_id  (:id tbl) :name "total"
                          :base_type :type/Float :position 0 :active true}
                         :model/Field _state
                         {:table_id  (:id tbl) :name "state"
                          :base_type :type/Text  :position 1 :active true}
                         :model/Transform t1
                         {:source          {:type :query :query (lib/native-query mp (tu/enrich-sql))}
                          :target          {:schema (tu/test-schema) :type "table"
                                            :name   enriched-name}
                          :target_table_id (:id tbl)}]
            (f {:t1            t1
                :tbl           tbl
                :enriched-name enriched-name
                :db-id         db-id
                :orders-id     (mt/id :orders)
                :people-id     (mt/id :people)})))))))

(defmacro ^:private with-card-chain
  "Run `body` inside the standard card-chain scaffolding: every
  `:transforms/table`-capable driver, `test-data` dataset, and the enrich
  topology — t1 (orders ⋈ people → enriched) with a synced temp Table (plus
  total and state Fields, so the MBQL metadata provider can build valid query
  stages) registered as its output. `ctx-binding` destructures the context map
  `{:t1 :tbl :enriched-name :db-id :orders-id :people-id}`."
  [[ctx-binding] & body]
  `(do-with-card-chain (fn [~ctx-binding] ~@body)))

;;; ===========================================================================
;;; Native card: passed
;;; ===========================================================================

(deftest card-chain-native-passed-test
  (testing "native card aggregating enriched passes against correct expected CSV"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            before-runs    (t2/count :model/TransformRun)
            card           (native-agg-card db-id enriched-name)
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            tu/correct-expected-csv {}
                            (t2/select :model/Transform))]
        (testing "status is passed"
          (is (= :passed (:status result))
              (str "Expected passed; diff: " (pr-str (:diff result)))))
        (testing "run order contains t1"
          (is (= [(:id t1)] (:order result))))
        (testing "diff sections are empty"
          (is (empty? (get-in result [:diff :missing-rows])))
          (is (empty? (get-in result [:diff :extra-rows])))
          (is (empty? (get-in result [:diff :cell-mismatches]))))
        (testing "all scratch tables cleaned up (2 leaves + 1 node output)"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))
        (testing "no TransformRun row created"
          (is (= before-runs (t2/count :model/TransformRun))))))))

;;; ===========================================================================
;;; Native card: failed
;;; ===========================================================================

(deftest card-chain-native-failed-test
  (testing "wrong expected CA count → failed with a named diff, scratch still cleaned"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            card           (native-agg-card db-id enriched-name)
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            tu/wrong-expected-csv {}
                            (t2/select :model/Transform))]
        (testing "status is failed"
          (is (= :failed (:status result))))
        (testing "diff reports the discrepancy"
          (is (or (seq (get-in result [:diff :missing-rows]))
                  (seq (get-in result [:diff :extra-rows]))
                  (seq (get-in result [:diff :cell-mismatches])))))
        (testing "scratch cleaned up even on a failed diff"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))

;;; ===========================================================================
;;; Native card: ignore_columns honored
;;; ===========================================================================

(deftest card-chain-ignore-columns-test
  (testing "ignore_columns: revenue excluded from both sides → passes even with wrong revenue"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      (let [;; revenue deliberately wrong — should be ignored
            wrong-rev-csv "state,order_count,revenue\nCA,3,999.00\nTX,1,999.00\n"
            card          (native-agg-card db-id enriched-name)
            result        (chain/run-card-chain-test!
                           card #{(:id t1)}
                           {orders-id tu/orders-rows people-id tu/people-rows}
                           wrong-rev-csv {:ignore-columns #{"revenue"}}
                           (t2/select :model/Transform))]
        (testing "status is passed when revenue is ignored"
          (is (= :passed (:status result))
              (str "Expected passed; diff: " (pr-str (:diff result)))))))))

;;; ===========================================================================
;;; MBQL card: passed (override-provider redirects by table id)
;;; ===========================================================================

(deftest card-chain-mbql-passed-test
  (testing "MBQL card (COUNT(*) over enriched) passes against correct expected CSV"
    (with-card-chain [{:keys [t1 tbl db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            ;; 4 fixture orders → enriched has 4 rows → COUNT = 4
            expected-csv   "count\n4\n"
            card           (mbql-count-card db-id (:id tbl))
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            expected-csv {}
                            (t2/select :model/Transform))]
        (testing "status is passed"
          (is (= :passed (:status result))
              (str "Expected passed; diff: " (pr-str (:diff result)))))
        (testing "run order contains t1"
          (is (= [(:id t1)] (:order result))))
        (testing "all scratch tables cleaned up"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))

;;; ===========================================================================
;;; MBQL card: failed (wrong expected value)
;;; ===========================================================================

(deftest card-chain-mbql-failed-test
  (testing "MBQL card with wrong expected COUNT → failed with diff, scratch cleaned"
    (with-card-chain [{:keys [t1 tbl db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            wrong-csv      "count\n99\n"
            card           (mbql-count-card db-id (:id tbl))
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            wrong-csv {}
                            (t2/select :model/Transform))]
        (testing "status is failed"
          (is (= :failed (:status result))))
        (testing "diff reports the discrepancy"
          (is (or (seq (get-in result [:diff :missing-rows]))
                  (seq (get-in result [:diff :extra-rows]))
                  (seq (get-in result [:diff :cell-mismatches])))))
        (testing "scratch cleaned up on failed diff"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))

;;; ===========================================================================
;;; Safety: verify fails closed when card refs an unmapped table
;;; ===========================================================================

(deftest card-chain-unmapped-table-fails-closed-test
  (testing "card SQL references a non-synced table → ::cannot-test-run"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      ;; This card joins enriched against `not_a_real_table` — a table that is
      ;; not synced in the app DB. `card->tables` / native-refs logs a warning and
      ;; drops it, so it is never added to the fixture leaf-deps. After native
      ;; rewrite only the mapping entries (enriched → scratch) are redirected;
      ;; `not_a_real_table` has no mapping entry and survives in the rewritten SQL.
      ;; verify catches the surviving non-scratch ref and throws ::cannot-test-run.
      (let [danger-card {:id            nil
                         :dataset_query (lib/native-query
                                         (lib-be/application-database-metadata-provider db-id)
                                         (str "SELECT state, count(*) AS n"
                                              " FROM " enriched-name
                                              " JOIN not_a_real_table ON 1=1"
                                              " GROUP BY state"))}
            thrown      (atom nil)]
        (try
          (chain/run-card-chain-test!
           danger-card #{(:id t1)}
           {orders-id tu/orders-rows people-id tu/people-rows}
           tu/correct-expected-csv {}
           (t2/select :model/Transform))
          (catch clojure.lang.ExceptionInfo e
            (reset! thrown e)))
        (testing "throws ::cannot-test-run"
          (is (some? @thrown))
          (is (= :metabase-enterprise.transforms-verification.errors/cannot-test-run
                 (:error-type (ex-data @thrown)))
              (str "Expected ::cannot-test-run; got: " (pr-str (ex-data @thrown)))))))))

;;; ===========================================================================
;;; Scratch DROPs run inside with-transform-connection (card target)
;;; ===========================================================================

(deftest card-chain-cleanup-inside-transform-connection-test
  ;; cleanup! self-elevates, so every DROP TABLE it issues must see
  ;; *connection-type* = :transform even though run-card-chain-test! runs in
  ;; ambient :default. We observe driver/drop-table! (the DROP seam, reached only
  ;; from inside the self-elevated scope).
  (testing "all scratch DROPs occur inside with-transform-connection (card target)"
    (let [captured (atom [])]
      (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
        (let [card (native-agg-card db-id enriched-name)
              orig driver/drop-table!]
          ;; driver/drop-table! is a multimethod → raw with-redefs (in-thread run).
          (with-redefs [driver/drop-table!
                        (fn [& args]
                          (swap! captured conj @#'driver.conn/*connection-type*)
                          (apply orig args))]
            (chain/run-card-chain-test!
             card #{(:id t1)}
             {orders-id tu/orders-rows people-id tu/people-rows}
             tu/correct-expected-csv {}
             (t2/select :model/Transform))))
        (is (pos? (count @captured))
            "drop-table! should have been called at least once")
        (is (every? #{:transform} @captured)
            (str "every DROP must see *connection-type* = :transform; "
                 "got: " (pr-str @captured)))))))

;;; ===========================================================================
;;; card-subgraph-input-tables
;;; ===========================================================================

(deftest card-subgraph-input-tables-test
  (testing "card-subgraph-input-tables returns leaf table-infos for a card target"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      (let [all-transforms (t2/select :model/Transform)
            card           (native-agg-card db-id enriched-name)
            infos          (chain/card-subgraph-input-tables card #{(:id t1)} all-transforms)]
        (testing "both leaf tables (orders, people) are returned"
          (is (= #{orders-id people-id} (set (map :id infos)))))
        (testing "each descriptor carries schema, name, and column headers"
          (is (every? (fn [d] (and ((some-fn nil? string?) (:schema d))
                                   (string? (:name d))
                                   (seq (:columns d))))
                      infos)))))))

;;; ===========================================================================
;;; No real table created (warehouse check)
;;; ===========================================================================

(deftest card-chain-no-real-table-test
  (testing "card target run: enriched scratch table is cleaned; no production table persists"
    (with-card-chain [{:keys [t1 enriched-name db-id orders-id people-id]}]
      (let [card (native-agg-card db-id enriched-name)]
        (chain/run-card-chain-test!
         card #{(:id t1)}
         {orders-id tu/orders-rows people-id tu/people-rows}
         tu/correct-expected-csv {}
         (t2/select :model/Transform))
        ;; After the run, verify that enriched-name (t1's real output) is absent.
        ;; driver/table-exists? (not information_schema): BigQuery has no
        ;; instance-global information_schema.
        (testing "t1 real output table was never written"
          (is (not (driver/table-exists? driver/*driver* (mt/db)
                                         {:schema (tu/scratch-namespace db-id)
                                          :name   enriched-name}))))))))

;;; ===========================================================================
;;; Metric card: :type :metric card as card target
;;; ===========================================================================

(defn- metric-sum-card
  "A `:type :metric` Card computing SUM(total) over the enriched table."
  [db-id tbl-id total-field-id]
  (let [mp    (lib-be/application-database-metadata-provider db-id)
        tbl   (lib.metadata/table mp tbl-id)
        field (lib.metadata/field mp total-field-id)
        q     (-> (lib/query mp tbl)
                  (lib/aggregate (lib/sum (lib/ref field))))]
    {:id            nil
     :type          :metric
     :dataset_query q}))

;;; SUM(total) over 4 fixture orders: 100 + 50 + 200 + 30 = 380.
(def ^:private metric-expected-csv "sum\n380.00\n")
(def ^:private metric-wrong-csv    "sum\n999.00\n")

;;; ===========================================================================
;;; Metric card: passed
;;; ===========================================================================

(deftest card-chain-metric-passed-test
  (testing "metric card (SUM over enriched) passes against correct expected CSV"
    (with-card-chain [{:keys [t1 tbl db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            ;; total field was created by the fixture as position 0
            total-field-id (t2/select-one-fn :id :model/Field
                                             :table_id (:id tbl)
                                             :name "total")
            card           (metric-sum-card db-id (:id tbl) total-field-id)
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            metric-expected-csv {}
                            (t2/select :model/Transform))]
        (testing "status is passed"
          (is (= :passed (:status result))
              (str "Expected passed; diff: " (pr-str (:diff result)))))
        (testing "run order contains t1"
          (is (= [(:id t1)] (:order result))))
        (testing "all scratch tables cleaned up"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))

;;; ===========================================================================
;;; Metric card: failed (wrong expected value)
;;; ===========================================================================

(deftest card-chain-metric-failed-test
  (testing "metric card with wrong expected SUM → failed with diff, scratch cleaned"
    (with-card-chain [{:keys [t1 tbl db-id orders-id people-id]}]
      (let [before-scratch (tu/count-test-scratch-tables db-id)
            total-field-id (t2/select-one-fn :id :model/Field
                                             :table_id (:id tbl)
                                             :name "total")
            card           (metric-sum-card db-id (:id tbl) total-field-id)
            result         (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            metric-wrong-csv {}
                            (t2/select :model/Transform))]
        (testing "status is failed"
          (is (= :failed (:status result))))
        (testing "diff reports the discrepancy"
          (is (or (seq (get-in result [:diff :missing-rows]))
                  (seq (get-in result [:diff :extra-rows]))
                  (seq (get-in result [:diff :cell-mismatches])))))
        (testing "scratch cleaned up on failed diff"
          (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))

;;; ===========================================================================
;;; Metric card: card-subgraph-input-tables
;;; ===========================================================================

(deftest card-chain-metric-subgraph-inputs-test
  (testing "card-subgraph-input-tables works for a metric card target"
    (with-card-chain [{:keys [t1 tbl db-id orders-id people-id]}]
      (let [total-field-id (t2/select-one-fn :id :model/Field
                                             :table_id (:id tbl)
                                             :name "total")
            card           (metric-sum-card db-id (:id tbl) total-field-id)
            all-transforms (t2/select :model/Transform)
            infos          (chain/card-subgraph-input-tables card #{(:id t1)} all-transforms)]
        (testing "both leaf tables (orders, people) are returned"
          (is (= #{orders-id people-id} (set (map :id infos)))))
        (testing "each descriptor carries schema, name, and column headers"
          (is (every? (fn [d] (and ((some-fn nil? string?) (:schema d))
                                   (string? (:name d))
                                   (seq (:columns d))))
                      infos)))))))
