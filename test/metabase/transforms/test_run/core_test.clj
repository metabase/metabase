(ns metabase.transforms.test-run.core-test
  "Integration tests for the test-run orchestrator.

  All integration tests run under the :postgres gate (real DDL required).

  ## Test strategy

  Each test verifies:
  1. The functional result (:passed / :failed / typed error).
  2. The cleanup invariant: zero mb_transform_temp_table_test_* tables remain
     in the schema after every case — including error and timeout paths.
  3. No TransformRun row was created."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.connection :as driver.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [metabase.transforms.test-run.core :as test-run.core]
   [metabase.transforms.test-run.execute :as test-run.execute]
   [metabase.transforms.test-run.inputs :as inputs]
   [metabase.transforms.test-run.resolve :as resolve]
   [metabase.transforms.test-run.scratch :as scratch]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; CSV temp-file helpers
;;; ---------------------------------------------------------------------------

(defn- write-temp-csv!
  "Write csv-string to a temporary file and return the java.io.File."
  ^File [csv-string]
  (doto (File/createTempFile "test-run-fixture-" ".csv")
    (spit csv-string)))

(defmacro with-temp-csvs
  "Create temp CSV files for each [name csv-str] pair in bindings, run body,
  then delete all files in finally."
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
;;; Test invariant helpers
;;; ---------------------------------------------------------------------------

(defn- count-test-scratch-tables
  "Count mb_transform_temp_table_test_* tables in schema on db-id via
  information_schema. Production transform temp tables (hex-millis suffix, no
  _test_ segment) are never matched."
  [db-id ^String schema]
  (let [result (qp/process-query
                {:database db-id
                 :type     :native
                 :native   {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                        " WHERE table_schema = '" schema "'"
                                        " AND table_name LIKE 'mb_transform_temp_table_test_%'")}})]
    (-> result (get-in [:data :rows]) first first int)))

(defn- transform-run-count []
  (t2/count :model/TransformRun))

(defmacro assert-cleanup-invariant
  "After body executes, assert: (1) no test-scratch tables remain in schema,
  (2) TransformRun count is unchanged."
  [db-id schema & body]
  `(let [before-runs# (transform-run-count)]
     ~@body
     (is (zero? (count-test-scratch-tables ~db-id ~schema))
         (str "Cleanup invariant: scratch tables remain in " ~schema))
     (is (= before-runs# (transform-run-count))
         "No TransformRun row should be created by run-test!")))

;;; ---------------------------------------------------------------------------
;;; Transform construction helpers
;;; ---------------------------------------------------------------------------

(defn- native-transform
  "Build a native-SQL transform via lib/native-query (NEVER raw legacy map)."
  [mp sql target-schema]
  {:source {:type :query :query (lib/native-query mp sql)}
   :target {:schema target-schema :type "table"}})

(defn- mbql-count-transform
  "Build an MBQL transform that computes COUNT(*) over table-kw."
  [mp table-kw target-schema]
  (let [tbl (lib.metadata/table mp (mt/id table-kw))
        q   (-> (lib/query mp tbl) (lib/aggregate (lib/count)))]
    {:source {:type :query :query q}
     :target {:schema target-schema :type "table"}}))

;;; ---------------------------------------------------------------------------
;;; Fixture CSV constants
;;; ---------------------------------------------------------------------------

;; orders columns in position order (matching real test-data schema):
;;   id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity
;; Empty 7th field = NULL discount.
(def ^:private orders-header
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

;; 3 rows: user 1 has 2 orders, user 2 has 1 order.
(def ^:private orders-3-rows
  (str orders-header "\n"
       "1,1,14,37.65,2.07,100.00,,2019-02-11T21:40:27.892Z,2\n"
       "2,1,16,49.21,2.71,200.00,,2019-02-11T21:40:27.892Z,2\n"
       "3,2,22,88.86,4.89,150.00,,2019-02-11T21:40:27.892Z,3\n"))

;; 1 row only.
(def ^:private orders-1-row
  (str orders-header "\n"
       "1,1,14,37.65,2.07,100.00,,2019-02-11T21:40:27.892Z,2\n"))

;; 2 rows: one per user.
(def ^:private orders-2-rows
  (str orders-header "\n"
       "1,1,14,37.65,2.07,100.00,,2019-02-11T21:40:27.892Z,2\n"
       "2,2,16,49.21,2.71,200.00,,2019-02-11T21:40:27.892Z,2\n"))

;;; ===========================================================================
;;; Happy path — native transform
;;; ===========================================================================

(deftest happy-path-native-transform-test
  (testing "native transform: COUNT(*) GROUP BY user_id -> :passed"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [orders-f   orders-3-rows
                                       expected-f "user_id,order_count\n1,2\n2,1\n"]
                                      (let [transform (native-transform
                                                       mp
                                                       "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id ORDER BY user_id"
                                                       schema)
                                            result    (test-run.core/run-test!
                                                       transform {orders-id orders-f} expected-f {})]
                                        (is (= :passed (:status result))
                                            (str "Expected :passed; diff: " (pr-str (:diff result))))))))))))

;;; ===========================================================================
;;; Happy path — MBQL transform
;;; ===========================================================================

(deftest happy-path-mbql-transform-test
  (testing "MBQL COUNT(*) over orders fixture (3 rows) -> :passed"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [orders-f   orders-3-rows
                                       expected-f "count\n3\n"]
                                      (let [transform (mbql-count-transform mp :orders schema)
                                            result    (test-run.core/run-test!
                                                       transform {orders-id orders-f} expected-f {})]
                                        (is (= :passed (:status result))
                                            (str "Expected :passed; got: " (pr-str result)))))))))))

;;; ===========================================================================
;;; Failing diff
;;; ===========================================================================

(deftest failing-diff-test
  (testing "wrong expected values -> :failed with nonempty missing/extra rows"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [orders-f   orders-3-rows
                                       ;; user 1 has 2 orders but expected says 99 — deliberately wrong.
                                       expected-f "user_id,order_count\n1,99\n2,1\n"]
                                      (let [transform (native-transform
                                                       mp
                                                       "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id ORDER BY user_id"
                                                       schema)
                                            result    (test-run.core/run-test!
                                                       transform {orders-id orders-f} expected-f {})]
                                        (is (= :failed (:status result))
                                            "Expected :failed with wrong expected data")
                                        (is (or (seq (get-in result [:diff :missing-rows]))
                                                (seq (get-in result [:diff :extra-rows]))
                                                (seq (get-in result [:diff :cell-mismatches])))
                                            (str "Diff report should show differences: "
                                                 (pr-str (:diff result))))))))))))

;;; ===========================================================================
;;; Missing fixture -> typed error + cleanup
;;; ===========================================================================

(deftest missing-fixture-test
  (testing "no fixtures provided -> ::missing-fixtures error, cleanup runs"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id  (mt/id)
              schema "public"
              mp     (mt/metadata-provider)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [expected-f "user_id,order_count\n1,2\n"]
                                      (let [transform (native-transform
                                                       mp
                                                       "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id"
                                                       schema)
                                            e         (try
                                                        (test-run.core/run-test! transform {} expected-f {})
                                                        nil
                                                        (catch clojure.lang.ExceptionInfo ex ex))]
                                        (is (some? e) "Expected an exception for missing fixture")
                                        (when e
                                          (is (= ::inputs/missing-fixtures
                                                 (:error-type (ex-data e)))))))))))))

;;; ===========================================================================
;;; Rewrite-failure (table-qualified column) -> typed error + cleanup
;;; ===========================================================================

(deftest rewrite-failure-test
  (testing "table-qualified column SQL (SELECT orders.id FROM orders) -> ::cannot-test-run"
    ;; The FROM-only rewrite leaves the `orders.` qualifier dangling on the
    ;; SELECT column -> guard 3 fires -> ::cannot-test-run.
    ;; Fixture must still have all 9 columns for the parse-fixture step.
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [orders-f   orders-1-row
                                       expected-f "id\n1\n"]
                                      (let [transform (native-transform
                                                       mp
                                                       "SELECT orders.id FROM orders"
                                                       schema)
                                            e         (try
                                                        (test-run.core/run-test!
                                                         transform {orders-id orders-f} expected-f {})
                                                        nil
                                                        (catch clojure.lang.ExceptionInfo ex ex))]
                                        (is (some? e) "Expected ::cannot-test-run exception")
                                        (when e
                                          (is (= ::resolve/cannot-test-run
                                                 (:error-type (ex-data e)))
                                              (str "Got: " (pr-str (:error-type (ex-data e))))))))))))))

;;; ===========================================================================
;;; Cleanup invariant — explicit checks for error paths
;;; ===========================================================================

(deftest cleanup-after-missing-fixture-test
  (testing "missing-fixture error: no seeding, no scratch tables left"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id  (mt/id)
              schema "public"
              mp     (mt/metadata-provider)
              before (count-test-scratch-tables db-id schema)
              runs   (transform-run-count)]
          (with-temp-csvs
            [expected-f "x\n1\n"]
            (try
              (test-run.core/run-test!
               (native-transform mp "SELECT id FROM orders" schema)
               {}
               expected-f
               {})
              (catch clojure.lang.ExceptionInfo _)))
          (is (= before (count-test-scratch-tables db-id schema))
              "No scratch tables after missing-fixture error")
          (is (= runs (transform-run-count))
              "No TransformRun row"))))))

(deftest cleanup-after-rewrite-failure-test
  (testing "rewrite failure: seeding occurs but cleanup runs before throw"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)
              before    (count-test-scratch-tables db-id schema)
              runs      (transform-run-count)]
          (with-temp-csvs
            [orders-f   orders-1-row
             expected-f "id\n1\n"]
            (try
              (test-run.core/run-test!
               (native-transform mp "SELECT orders.id FROM orders" schema)
               {orders-id orders-f}
               expected-f
               {})
              (catch clojure.lang.ExceptionInfo _)))
          (is (= before (count-test-scratch-tables db-id schema))
              "No scratch tables after rewrite failure")
          (is (= runs (transform-run-count))
              "No TransformRun row"))))))

;;; ===========================================================================
;;; No TransformRun row — explicit test
;;; ===========================================================================

(deftest no-transform-run-row-test
  (testing "run-test! never creates a TransformRun row (success and failure paths)"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [_db-id    (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)
              before    (transform-run-count)]
          (with-temp-csvs
            [orders-f   orders-2-rows
             expected-f "user_id,order_count\n1,1\n2,1\n"]
            (try
              (test-run.core/run-test!
               (native-transform
                mp
                "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id ORDER BY user_id"
                schema)
               {orders-id orders-f}
               expected-f
               {})
              (catch Exception _)))
          (is (= before (transform-run-count))
              "TransformRun count must be unchanged"))))))

;;; ===========================================================================
;;; Timeout — pg_sleep + tiny timeout -> exception + cleanup
;;; ===========================================================================

(deftest timeout-test
  (testing "slow transform times out; scratch tables still cleaned up"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)
              before    (count-test-scratch-tables db-id schema)
              runs      (transform-run-count)]
          (with-temp-csvs
            [orders-f   orders-1-row
             expected-f "total\n100.00\n"]
            ;; pg_sleep(10) blocks for 10s; we set a 1s statement timeout -> throws.
            (let [threw? (try
                           (test-run.core/run-test!
                            (native-transform
                             mp
                             "SELECT total FROM orders WHERE pg_sleep(10) IS NOT NULL"
                             schema)
                            {orders-id orders-f}
                            expected-f
                            {:timeout-ms 1000})
                           false
                           (catch Exception _ true))]
              (is threw? "Expected exception from pg_sleep timeout")
              (is (= before (count-test-scratch-tables db-id schema))
                  "No scratch tables remain after timeout")
              (is (= runs (transform-run-count))
                  "No TransformRun row after timeout"))))))))

;;; ===========================================================================
;;; Regression: read-back-output must use quoted identifiers
;;; ===========================================================================

(deftest read-back-output-uses-quoted-identifiers-test
  ;; Regression: read-back-output was building SELECT * FROM <schema>.<table>
  ;; by string interpolation: (str "SELECT * FROM " schema "." table).
  ;; A schema with a single quote (e.g. "pub'lic") produces malformed SQL.
  ;; Since schema and table are IDENTIFIERS (not values), the fix must use driver-level
  ;; identifier quoting (sql.u/quote-name), not ? parameterization.
  ;;
  ;; We intercept qp/process-query and inspect the submitted SQL to verify it uses
  ;; properly quoted identifiers instead of raw interpolation.
  (testing "read-back-output submits a SELECT with properly quoted schema.table identifiers"
    (let [captured-queries (atom [])
          fake-process     (fn [q]
                             (swap! captured-queries conj q)
                             {:status :completed
                              :data   {:cols [] :rows []}})]
      (with-redefs [qp/process-query fake-process]
        ;; Call the private function via the public run-test! path by using an output-spec
        ;; with a tricky schema name.  We use with-driver :postgres so quote-name resolves correctly.
        ;; Since run-test! calls cleanup! which also queries qp, we test read-back-output directly
        ;; by constructing its call signature via the #'var accessor.
        (mt/with-driver :postgres
          (#'test-run.execute/read-back-output 999 :postgres {:schema "pub'lic" :table "mb_transform_temp_table_test_abc_xyz_out"})))
      (is (= 1 (count @captured-queries))
          "exactly one query submitted")
      (let [sql (get-in (first @captured-queries) [:native :query])]
        ;; The query must NOT contain the raw single-quote character inside the schema/table identifiers
        (is (not (re-find #"FROM pub'lic" sql))
            "raw interpolation of schema with quote must not appear in SQL")
        ;; The query must use double-quote quoting (Postgres style) around the identifiers
        (is (re-find #"\"pub'lic\"" sql)
            "schema must be double-quote quoted in the SQL (Postgres identifier quoting)")
        (is (string? sql)
            "SQL must be a string")))))

;;; ===========================================================================
;;; :ignore-columns passes through a noisy NOW() column
;;; ===========================================================================

(deftest ignore-columns-test
  (testing ":ignore-columns skips a NOW() column -> :passed despite ts mismatch"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [db-id     (mt/id)
              schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)]
          (assert-cleanup-invariant db-id schema
                                    (with-temp-csvs
                                      [orders-f   orders-2-rows
                                       ;; ts column has a placeholder value that won't match NOW() output,
                                       ;; but :ignore-columns #{"ts"} excludes it from the diff.
                                       expected-f "user_id,order_count,ts\n1,1,1970-01-01T00:00:00Z\n2,1,1970-01-01T00:00:00Z\n"]
                                      (let [transform (native-transform
                                                       mp
                                                       (str "SELECT user_id, COUNT(*) AS order_count, NOW() AS ts"
                                                            " FROM orders GROUP BY user_id ORDER BY user_id")
                                                       schema)
                                            result    (test-run.core/run-test!
                                                       transform {orders-id orders-f} expected-f
                                                       {:ignore-columns #{"ts"}})]
                                        (is (= :passed (:status result))
                                            (str "Expected :passed with ts ignored; got: "
                                                 (pr-str result)))))))))))

;;; ===========================================================================
;;; Contract: cleanup! runs inside the transform connection context
;;; ===========================================================================

;; CONTRACT (documented in scratch.clj:29-34): cleanup! is called by the
;; orchestrator while *connection-type* is bound to :transform. On databases
;; configured with separate write-data credentials the DROP TABLE issued by
;; cleanup! must run on those credentials — if it runs after with-transform-
;; connection unwinds, *connection-type* reverts to :default and the DROP
;; runs with read credentials, leaking every scratch table.
;;
;; The test DB uses a single credential set, so the operational failure is
;; invisible in CI. We make it visible by intercepting scratch/cleanup! and
;; capturing the value of *connection-type* at call time, then asserting it
;; equals :transform. A :default value proves the bug is present.

(deftest cleanup-runs-inside-transform-connection-success-test
  (testing "cleanup! is invoked while *connection-type* is :transform (success path)"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)
              captured  (atom nil)]
          (mt/with-dynamic-fn-redefs [scratch/cleanup!
                                      (fn [& args]
                                        ;; Capture connection-type at the moment cleanup! is called.
                                        (reset! captured @#'driver.conn/*connection-type*)
                                        (apply (mt/original-fn #'scratch/cleanup!) args))]
            (with-temp-csvs
              [orders-f   orders-3-rows
               expected-f "user_id,order_count\n1,2\n2,1\n"]
              (test-run.core/run-test!
               (native-transform
                mp
                "SELECT user_id, COUNT(*) AS order_count FROM orders GROUP BY user_id ORDER BY user_id"
                schema)
               {orders-id orders-f}
               expected-f
               {})))
          (is (= :transform @captured)
              (str "cleanup! must be called inside with-transform-connection "
                   "(got *connection-type* = " (pr-str @captured) ")")))))))

(deftest cleanup-runs-inside-transform-connection-error-test
  (testing "cleanup! is invoked while *connection-type* is :transform (error path)"
    ;; Verify the contract holds even when the run throws an error before
    ;; the transform executes (rewrite failure — seeding occurs, then throws).
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [schema    "public"
              mp        (mt/metadata-provider)
              orders-id (mt/id :orders)
              captured  (atom nil)]
          (mt/with-dynamic-fn-redefs [scratch/cleanup!
                                      (fn [& args]
                                        (reset! captured @#'driver.conn/*connection-type*)
                                        (apply (mt/original-fn #'scratch/cleanup!) args))]
            (with-temp-csvs
              [orders-f   orders-1-row
               expected-f "id\n1\n"]
              (try
                (test-run.core/run-test!
                 ;; table-qualified column → ::cannot-test-run after seeding
                 (native-transform mp "SELECT orders.id FROM orders" schema)
                 {orders-id orders-f}
                 expected-f
                 {})
                (catch clojure.lang.ExceptionInfo _))))
          (is (= :transform @captured)
              (str "cleanup! must be called inside with-transform-connection on error path "
                   "(got *connection-type* = " (pr-str @captured) ")")))))))
