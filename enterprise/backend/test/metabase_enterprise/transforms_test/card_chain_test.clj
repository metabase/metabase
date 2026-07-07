(ns ^:mb/driver-tests metabase-enterprise.transforms-test.card-chain-test
  "End-to-end tests for the card-target chained test-run orchestrator
  ([[metabase-enterprise.transforms-test.chain/run-card-chain-test!]]).

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
   [metabase-enterprise.transforms-test.chain :as chain]
   [metabase-enterprise.transforms-test.execute :as execute]
   [metabase-enterprise.transforms-test.scratch :as scratch]
   [metabase-enterprise.transforms-test.test-util :as tu]
   [metabase.driver.connection :as driver.conn]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; t1 (enrich): orders ⋈ people → enriched (total, state columns)
;;;
;;; t1's output becomes the card's source table. The card aggregates over it.
;;; Shared fixtures ([[tu/orders-rows]], [[tu/people-rows]], [[tu/enrich-sql]],
;;; expected CSVs) live in [[metabase-enterprise.transforms-test.test-util]].
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

(defmacro ^:private with-enrich-topology
  "Bind `t1-sym` and `tbl-sym` to the temp transform and table for the enrich
  topology. Creates two `:model/Field` rows (total, state) on the temp table
  so the MBQL metadata provider can build valid query stages."
  [[t1-sym tbl-sym enriched-name-sym] & body]
  (let [f1 (gensym "field-total")
        f2 (gensym "field-state")]
    `(let [~enriched-name-sym (mt/random-name)
           db-id#             (mt/id)
           mp#                (mt/metadata-provider)]
       (mt/with-temp [:model/Table ~tbl-sym
                      {:db_id  db-id# :schema (tu/test-schema)
                       :name   ~enriched-name-sym :active true}
                      :model/Field ~f1
                      {:table_id  (:id ~tbl-sym) :name "total"
                       :base_type :type/Float :position 0 :active true}
                      :model/Field ~f2
                      {:table_id  (:id ~tbl-sym) :name "state"
                       :base_type :type/Text  :position 1 :active true}
                      :model/Transform ~t1-sym
                      {:source          {:type :query :query (lib/native-query mp# tu/enrich-sql)}
                       :target          {:schema (tu/test-schema) :type "table"
                                         :name   ~enriched-name-sym}
                       :target_table_id (:id ~tbl-sym)}]
         ~@body))))

;;; ===========================================================================
;;; Native card: passed
;;; ===========================================================================

(deftest card-chain-native-passed-test
  (testing "native card aggregating enriched passes against correct expected CSV"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)
                before-runs    (t2/count :model/TransformRun)]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [card   (native-agg-card db-id enriched-name)
                    result (chain/run-card-chain-test!
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
                  (is (= before-runs (t2/count :model/TransformRun))))))))))))

;;; ===========================================================================
;;; Native card: failed
;;; ===========================================================================

(deftest card-chain-native-failed-test
  (testing "wrong expected CA count → failed with a named diff, scratch still cleaned"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [card   (native-agg-card db-id enriched-name)
                    result (chain/run-card-chain-test!
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
                  (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))))))

;;; ===========================================================================
;;; Native card: ignore_columns honored
;;; ===========================================================================

(deftest card-chain-ignore-columns-test
  (testing "ignore_columns: revenue excluded from both sides → passes even with wrong revenue"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                ;; revenue deliberately wrong — should be ignored
                wrong-rev-csv  "state,order_count,revenue\nCA,3,999.00\nTX,1,999.00\n"]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [card   (native-agg-card db-id enriched-name)
                    result (chain/run-card-chain-test!
                            card #{(:id t1)}
                            {orders-id tu/orders-rows people-id tu/people-rows}
                            wrong-rev-csv {:ignore-columns #{"revenue"}}
                            (t2/select :model/Transform))]
                (testing "status is passed when revenue is ignored"
                  (is (= :passed (:status result))
                      (str "Expected passed; diff: " (pr-str (:diff result)))))))))))))

;;; ===========================================================================
;;; MBQL card: passed (override-provider redirects by table id)
;;; ===========================================================================

(deftest card-chain-mbql-passed-test
  (testing "MBQL card (COUNT(*) over enriched) passes against correct expected CSV"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)
                ;; 4 fixture orders → enriched has 4 rows → COUNT = 4
                expected-csv   "count\n4\n"]
            (with-enrich-topology [t1 tbl _enriched-name]
              (let [card   (mbql-count-card db-id (:id tbl))
                    result (chain/run-card-chain-test!
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
                  (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))))))

;;; ===========================================================================
;;; MBQL card: failed (wrong expected value)
;;; ===========================================================================

(deftest card-chain-mbql-failed-test
  (testing "MBQL card with wrong expected COUNT → failed with diff, scratch cleaned"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)
                wrong-csv      "count\n99\n"]
            (with-enrich-topology [t1 tbl _enriched-name]
              (let [card   (mbql-count-card db-id (:id tbl))
                    result (chain/run-card-chain-test!
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
                  (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))))))

;;; ===========================================================================
;;; Safety: verify fails closed when card refs an unmapped table
;;; ===========================================================================

(deftest card-chain-unmapped-table-fails-closed-test
  (testing "card SQL references a non-synced table → ::cannot-test-run"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)]
            (with-enrich-topology [t1 _tbl enriched-name]
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
                  (is (= :metabase-enterprise.transforms-test.errors/cannot-test-run
                         (:error-type (ex-data @thrown)))
                      (str "Expected ::cannot-test-run; got: " (pr-str (ex-data @thrown)))))))))))))

;;; ===========================================================================
;;; Cleanup runs inside with-transform-connection
;;; ===========================================================================

(deftest card-chain-cleanup-inside-transform-connection-test
  (testing "all cleanup! calls occur inside with-transform-connection (card target)"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                captured       (atom [])]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [card (native-agg-card db-id enriched-name)]
                (mt/with-dynamic-fn-redefs [scratch/cleanup!
                                            (fn [& args]
                                              (swap! captured conj @#'driver.conn/*connection-type*)
                                              (apply (mt/original-fn #'scratch/cleanup!) args))]
                  (chain/run-card-chain-test!
                   card #{(:id t1)}
                   {orders-id tu/orders-rows people-id tu/people-rows}
                   tu/correct-expected-csv {}
                   (t2/select :model/Transform)))))
            (is (pos? (count @captured))
                "cleanup! should have been called at least once")
            (is (every? #{:transform} @captured)
                (str "every cleanup! call must see *connection-type* = :transform; "
                     "got: " (pr-str @captured)))))))))

;;; ===========================================================================
;;; card-subgraph-input-tables
;;; ===========================================================================

(deftest card-subgraph-input-tables-test
  (testing "card-subgraph-input-tables returns leaf table-infos for a card target"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [all-transforms (t2/select :model/Transform)
                    card           (native-agg-card db-id enriched-name)
                    infos          (chain/card-subgraph-input-tables card #{(:id t1)} all-transforms)]
                (testing "both leaf tables (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :id infos)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and ((some-fn nil? string?) (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              infos)))))))))))

;;; ===========================================================================
;;; No real table created (warehouse check)
;;; ===========================================================================

(deftest card-chain-no-real-table-test
  (testing "card target run: enriched scratch table is cleaned; no production table persists"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)]
            (with-enrich-topology [t1 _tbl enriched-name]
              (let [card (native-agg-card db-id enriched-name)]
                (chain/run-card-chain-test!
                 card #{(:id t1)}
                 {orders-id tu/orders-rows people-id tu/people-rows}
                 tu/correct-expected-csv {}
                 (t2/select :model/Transform))
                ;; After the run, verify that enriched-name (t1's real output) is absent.
                (let [result (qp.core/process-query
                              (execute/native-query
                               db-id
                               (str "SELECT COUNT(*) FROM information_schema.tables"
                                    " WHERE table_schema = 'public' AND table_name = ?")
                               [enriched-name]))]
                  (testing "t1 real output table was never written"
                    (is (= 0 (-> result (get-in [:data :rows]) first first int)))))))))))))

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
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)]
            (with-enrich-topology [t1 tbl _enriched-name]
              (let [;; total field was created by with-enrich-topology as position 0
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
                  (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))))))

;;; ===========================================================================
;;; Metric card: failed (wrong expected value)
;;; ===========================================================================

(deftest card-chain-metric-failed-test
  (testing "metric card with wrong expected SUM → failed with diff, scratch cleaned"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id          (mt/id)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id)]
            (with-enrich-topology [t1 tbl _enriched-name]
              (let [total-field-id (t2/select-one-fn :id :model/Field
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
                  (is (= before-scratch (tu/count-test-scratch-tables db-id))))))))))))

;;; ===========================================================================
;;; Metric card: card-subgraph-input-tables
;;; ===========================================================================

(deftest card-chain-metric-subgraph-inputs-test
  (testing "card-subgraph-input-tables works for a metric card target"
    (mt/with-premium-features #{}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id     (mt/id)
                orders-id (mt/id :orders)
                people-id (mt/id :people)]
            (with-enrich-topology [t1 tbl _enriched-name]
              (let [total-field-id  (t2/select-one-fn :id :model/Field
                                                      :table_id (:id tbl)
                                                      :name "total")
                    card            (metric-sum-card db-id (:id tbl) total-field-id)
                    all-transforms  (t2/select :model/Transform)
                    infos           (chain/card-subgraph-input-tables card #{(:id t1)} all-transforms)]
                (testing "both leaf tables (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :id infos)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and ((some-fn nil? string?) (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              infos)))))))))))
