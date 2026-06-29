(ns metabase.transforms.test-run.scratch-test
  "Tests for scratch table seeding + cleanup.

  Integration tests run under the :postgres gate only — they require a real
  Postgres connection to test DDL round-trips.  Pure tests (naming, parsing,
  predicate) are driver-free."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.query-processor.core :as qp]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.test-run.scratch :as scratch]))

(set! *warn-on-reflection* true)

;; scratch/seed! and scratch/cleanup! assert a :transform connection context. In
;; production the orchestrator wraps the whole run in with-transform-connection;
;; these tests exercise seed!/cleanup! directly, so establish the same context.
(use-fixtures :each (fn [thunk] (driver.conn/with-transform-connection (thunk))))

;;; ---------------------------------------------------------------------------
;;; Naming: encode + parse round-trip
;;; ---------------------------------------------------------------------------

(deftest name-encode-decode-round-trip-test
  (testing "encode→parse restores timestamp within 1-second tolerance"
    (let [nonce    "abc12345"
          now-secs (quot (System/currentTimeMillis) 1000)
          name-in  (scratch/scratch-table-name nonce "in_42")
          name-out (scratch/scratch-table-name nonce "out")
          parsed-in  (scratch/parse-scratch-table-name name-in)
          parsed-out (scratch/parse-scratch-table-name name-out)]
      ;; Both should parse successfully
      (is (some? parsed-in)  "in_ name should parse")
      (is (some? parsed-out) "out name should parse")
      ;; Timestamps should be close to now
      (is (<= (Math/abs (long (- (:epoch-seconds parsed-in) now-secs))) 1)
          "in_ timestamp within 1s of now")
      (is (<= (Math/abs (long (- (:epoch-seconds parsed-out) now-secs))) 1)
          "out timestamp within 1s of now")
      ;; Nonce preserved
      (is (= nonce (:nonce parsed-in)))
      (is (= nonce (:nonce parsed-out)))
      ;; Suffix preserved
      (is (= "in_42" (:suffix parsed-in)))
      (is (= "out" (:suffix parsed-out))))))

(deftest name-length-under-identifier-limit-test
  (testing "worst-case scratch name (10-digit table-id) stays under the Postgres 63
            and MySQL 64 identifier limits — pins the ns docstring's length claim so
            it can't silently rot if the prefix or nonce length changes"
    (let [;; longest realistic suffix: a 10-digit table id
          name (scratch/scratch-table-name (scratch/new-nonce) (str "in_" 9999999999))]
      (is (< (count name) 63)
          (str "scratch name is " (count name) " chars (must be < 63): " name)))))

(deftest name-age-computation-test
  (testing "timestamp encoded in name allows age computation from name alone"
    (let [;; Construct a name that appears to be 2 hours old
          two-hours-ago-secs (- (quot (System/currentTimeMillis) 1000) 7200)
          epoch36  (Long/toString two-hours-ago-secs 36)
          old-name (str transforms-base.u/transform-temp-table-prefix
                        "_test_" epoch36 "_aabbccdd_in_99")
          parsed   (scratch/parse-scratch-table-name old-name)]
      (is (some? parsed) "old name should parse")
      (is (<= (Math/abs (long (- (:epoch-seconds parsed) two-hours-ago-secs))) 1)
          "age-encoded timestamp round-trips correctly"))))

;;; ---------------------------------------------------------------------------
;;; Naming: test-table-name? predicate
;;; ---------------------------------------------------------------------------

(deftest test-table-name-positive-test
  (testing "test-table-name? is true for valid test scratch names"
    (let [nonce "x1y2z3w4"]
      (is (scratch/test-table-name? (scratch/scratch-table-name nonce "in_5")))
      (is (scratch/test-table-name? (scratch/scratch-table-name nonce "out")))
      ;; String input
      (is (scratch/test-table-name? (str transforms-base.u/transform-temp-table-prefix
                                         "_test_tgfsdq_deadbeef_in_123")))
      ;; Keyword input
      (is (scratch/test-table-name? (keyword "public"
                                             (str transforms-base.u/transform-temp-table-prefix
                                                  "_test_tgfsdq_deadbeef_in_123")))))))

(deftest test-table-name-negative-test
  (testing "test-table-name? is false for non-test names"
    ;; Production transform temp table (hex millis, no _test_ segment)
    (is (not (scratch/test-table-name?
              "mb_transform_temp_table_18f9c3a2b1")))
    ;; Another production name pattern (timestamp without test_)
    (is (not (scratch/test-table-name?
              "mb_transform_temp_table_1781129582000")))
    ;; Ordinary table
    (is (not (scratch/test-table-name? "orders")))
    (is (not (scratch/test-table-name? "public.orders")))
    ;; Empty/nil
    (is (not (scratch/test-table-name? "")))
    (is (not (scratch/test-table-name? nil)))))

;;; ---------------------------------------------------------------------------
;;; Naming: nonce uniqueness
;;; ---------------------------------------------------------------------------

(deftest nonce-uniqueness-test
  (testing "two calls at the same instant produce distinct nonces"
    (let [nonce1 (scratch/new-nonce)
          nonce2 (scratch/new-nonce)]
      (is (not= nonce1 nonce2)
          "nonces must be unique across calls"))))

(deftest two-seeds-same-instant-no-collision-test
  (testing "same nonce never generated for concurrent seeds"
    ;; Generate 100 nonces and assert all unique
    (let [nonces (repeatedly 100 scratch/new-nonce)]
      (is (= (count nonces) (count (set nonces)))
          "100 nonces should all be unique"))))

;;; ---------------------------------------------------------------------------
;;; Naming: prefix builds on transforms-base.u/transform-temp-table-prefix
;;; ---------------------------------------------------------------------------

(deftest prefix-extends-base-prefix-test
  (testing "test table prefix starts with transform-temp-table-prefix"
    (let [nonce "deadbeef"
          name  (scratch/scratch-table-name nonce "out")]
      (is (str/starts-with? name transforms-base.u/transform-temp-table-prefix)
          "test table names must start with transform-temp-table-prefix to be sync-invisible"))))

;;; ---------------------------------------------------------------------------
;;; Naming: sync skip
;;; ---------------------------------------------------------------------------

(deftest sync-skip-test
  (testing "is-temp-transform-table? returns true for test scratch names"
    (let [nonce "sync1234"
          name  (scratch/scratch-table-name nonce "in_7")]
      (is (mt/with-driver :postgres
            (sync-util/is-temp-transform-table? {:name name}))
          "sync should skip test scratch tables"))))

(deftest sync-does-not-skip-production-prefix-test
  (testing "is-temp-transform-table? also true for production prefix (sanity)"
    ;; Any name starting with mb_transform_temp_table is skipped
    (is (mt/with-driver :postgres
          (sync-util/is-temp-transform-table? {:name "mb_transform_temp_table_1781129582000"}))
        "production temp tables also sync-skipped")))

;;; ---------------------------------------------------------------------------
;;; Naming: 63-char Postgres limit
;;; ---------------------------------------------------------------------------

(deftest name-under-63-chars-test
  (testing "scratch table names stay under 63-char Postgres identifier limit"
    (let [nonce         "12345678"
          ;; Worst case: epoch36 = 6 chars, nonce = 8 chars, table-id = 10 digits
          epoch36-max   "zzzzzz"
          big-table-id  2147483647
          name-in       (str transforms-base.u/transform-temp-table-prefix
                             "_test_" epoch36-max "_" nonce "_in_" big-table-id)
          name-out      (str transforms-base.u/transform-temp-table-prefix
                             "_test_" epoch36-max "_" nonce "_out")]
      (is (< (count name-in) 63)
          (str "in_ name too long: " (count name-in) " chars"))
      (is (< (count name-out) 63)
          (str "out name too long: " (count name-out) " chars")))))

;;; ---------------------------------------------------------------------------
;;; Naming: non-matching names don't parse
;;; ---------------------------------------------------------------------------

(deftest parse-returns-nil-for-non-test-names-test
  (testing "parse-scratch-table-name returns nil for non-test names"
    (is (nil? (scratch/parse-scratch-table-name "mb_transform_temp_table_18f9c3a2b1")))
    (is (nil? (scratch/parse-scratch-table-name "orders")))
    (is (nil? (scratch/parse-scratch-table-name "")))
    (is (nil? (scratch/parse-scratch-table-name nil)))))

;;; ---------------------------------------------------------------------------
;;; Integration: create/populate/read-back round-trip (Postgres)
;;; ---------------------------------------------------------------------------

(def ^:private sample-fixture
  "A fixture map with multiple column types."
  {:columns [{:name "id"     :base-type :type/Integer  :nullable? false}
             {:name "label"  :base-type :type/Text     :nullable? true}
             {:name "score"  :base-type :type/Float    :nullable? true}
             {:name "active" :base-type :type/Boolean  :nullable? true}]
   :rows    [[1 "alpha" 3.14 true]
             [2 "beta"  nil  false]
             [3 nil     1.0  nil]]})

(def ^:private sample-table-info
  "A table-info map for a fake input table."
  {:id      99999
   :schema  "public"
   :name    "orders"
   :columns [{:name "id"     :base-type :type/Integer  :nullable? false}
             {:name "label"  :base-type :type/Text     :nullable? true}
             {:name "score"  :base-type :type/Float    :nullable? true}
             {:name "active" :base-type :type/Boolean  :nullable? true}]})

(deftest create-populate-read-back-round-trip-test
  (mt/test-drivers #{:postgres}
    (testing "seed! creates + populates scratch table; columns and values survive verbatim"
      (let [nonce   (scratch/new-nonce)
            db-id   (mt/id)
            db      (mt/db)
            schema  "public"
            seed-input [{:table-info sample-table-info
                         :fixture    sample-fixture}]
            mapping (scratch/seed! db-id db schema seed-input nonce)]
        (try
          ;; mapping: {real-spec → scratch-spec}
          (is (= 1 (count mapping)) "one input → one mapping entry")
          (let [real-spec    {:schema "public" :table "orders"}
                scratch-spec (get mapping real-spec)]
            (is (some? scratch-spec) "real spec must map to a scratch spec")
            (is (= "public" (:schema scratch-spec)) "scratch schema matches")
            (is (scratch/test-table-name? (:table scratch-spec))
                "scratch table name must pass test-table-name?")
            ;; Read back via QP native query
            (let [result (qp/process-query
                          {:database db-id
                           :type :native
                           :native {:query (str "SELECT id, label, score, active FROM \""
                                                (:schema scratch-spec) "\".\"" (:table scratch-spec)
                                                "\" ORDER BY id")}})]
              (is (= :completed (:status result)))
              (let [rows (get-in result [:data :rows])]
                (is (= 3 (count rows)) "all 3 rows seeded")
                ;; Row 1: [1 "alpha" 3.14 true]
                (is (= 1 (first (nth rows 0))) "id preserved")
                (is (= "alpha" (second (nth rows 0))) "label preserved verbatim")
                ;; Row 2: [2 "beta" nil false]
                (is (= 2 (first (nth rows 1))))
                (is (nil? (nth (nth rows 1) 2)) "nil score preserved as NULL")
                (is (= false (nth (nth rows 1) 3)) "false preserved")
                ;; Row 3: [3 nil 1.0 nil]
                (is (nil? (second (nth rows 2))) "nil label preserved as NULL"))))
          (finally
            (scratch/cleanup! db-id db mapping nil)))))))

(deftest column-names-preserved-verbatim-test
  (mt/test-drivers #{:postgres}
    (testing "column names are passed to scratch table without munging"
      (let [nonce    (scratch/new-nonce)
            db-id    (mt/id)
            db       (mt/db)
            schema   "public"
            ;; Use mixed-case column names
            tbl-info {:id 99998 :schema "public" :name "products"
                      :columns [{:name "ProductID" :base-type :type/Integer :nullable? false}
                                {:name "unit_price" :base-type :type/Float :nullable? true}]}
            fixture  {:columns [{:name "ProductID" :base-type :type/Integer :nullable? false}
                                {:name "unit_price" :base-type :type/Float :nullable? true}]
                      :rows    [[1 9.99] [2 nil]]}
            mapping  (scratch/seed! db-id db schema [{:table-info tbl-info :fixture fixture}] nonce)]
        (try
          (let [scratch-spec (get mapping {:schema "public" :table "products"})]
            (is (some? scratch-spec))
            (let [result (qp/process-query
                          {:database db-id
                           :type :native
                           :native {:query (str "SELECT \"ProductID\", unit_price FROM \""
                                                (:schema scratch-spec) "\".\"" (:table scratch-spec)
                                                "\" ORDER BY \"ProductID\"")}})]
              (is (= :completed (:status result)))
              (is (= [[1 9.99] [2 nil]] (get-in result [:data :rows])))))
          (finally
            (scratch/cleanup! db-id db mapping nil)))))))

;;; ---------------------------------------------------------------------------
;;; Integration: cleanup (Postgres)
;;; ---------------------------------------------------------------------------

(deftest cleanup-drops-all-scratch-tables-test
  (mt/test-drivers #{:postgres}
    (testing "cleanup! drops every seeded scratch table + output spec"
      (let [nonce        (scratch/new-nonce)
            db-id        (mt/id)
            db           (mt/db)
            schema       "public"
            mapping      (scratch/seed! db-id db schema
                                        [{:table-info sample-table-info
                                          :fixture    sample-fixture}]
                                        nonce)
            ;; Fabricate an output spec that also needs cleanup
            output-name  (scratch/scratch-table-name nonce "out")
            output-spec  {:schema schema :table output-name}]
        ;; Verify table exists before cleanup
        (let [scratch-spec (get mapping {:schema "public" :table "orders"})
              pre-result   (qp/process-query
                            {:database db-id
                             :type :native
                             :native {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                                  " WHERE table_schema = '"
                                                  (:schema scratch-spec) "'"
                                                  " AND table_name = '"
                                                  (:table scratch-spec) "'")}})]
          (is (= 1 (ffirst (get-in pre-result [:data :rows])))))
        ;; Cleanup
        (scratch/cleanup! db-id db mapping output-spec)
        ;; Verify table is gone
        (let [scratch-spec (get mapping {:schema "public" :table "orders"})
              post-result  (qp/process-query
                            {:database db-id
                             :type :native
                             :native {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                                  " WHERE table_schema = '"
                                                  (:schema scratch-spec) "'"
                                                  " AND table_name = '"
                                                  (:table scratch-spec) "'")}})]
          (is (= 0 (ffirst (get-in post-result [:data :rows])))
              "scratch input table should be gone after cleanup"))))))

(deftest cleanup-idempotent-test
  (mt/test-drivers #{:postgres}
    (testing "cleanup! is idempotent — second call on already-dropped tables does not throw"
      (let [nonce   (scratch/new-nonce)
            db-id   (mt/id)
            db      (mt/db)
            schema  "public"
            mapping (scratch/seed! db-id db schema
                                   [{:table-info sample-table-info :fixture sample-fixture}]
                                   nonce)]
        (scratch/cleanup! db-id db mapping nil)
        ;; Second call — should not throw
        (is (nil? (scratch/cleanup! db-id db mapping nil))
            "second cleanup! call should return nil without throwing")))))

(deftest cleanup-after-partial-failure-test
  (mt/test-drivers #{:postgres}
    (testing "cleanup! drops already-created tables even after a partial seed failure"
      ;; We simulate partial failure by manually seeding one table then calling cleanup
      ;; with a mapping that includes an already-dropped table name
      (let [nonce        (scratch/new-nonce)
            db-id        (mt/id)
            db           (mt/db)
            schema       "public"
            ;; Seed one real table
            mapping      (scratch/seed! db-id db schema
                                        [{:table-info sample-table-info :fixture sample-fixture}]
                                        nonce)
            ;; Add a fake already-dropped spec to the mapping (simulates partial failure)
            fake-spec    {:schema "public"
                          :table  (str transforms-base.u/transform-temp-table-prefix
                                       "_test_" (Long/toString (quot (System/currentTimeMillis) 1000) 36)
                                       "_" nonce "_in_00001")}
            aug-mapping  (assoc mapping {:schema "public" :table "fake_tbl"} fake-spec)]
        ;; cleanup! should handle the non-existent fake_spec without throwing
        ;; AND still drop the real one
        (is (nil? (scratch/cleanup! db-id db aug-mapping nil))
            "cleanup! with a mix of real + missing tables should not throw")
        ;; Real table should be gone
        (let [scratch-spec (get mapping {:schema "public" :table "orders"})
              post-result  (qp/process-query
                            {:database db-id
                             :type :native
                             :native {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                                  " WHERE table_schema = '"
                                                  (:schema scratch-spec) "'"
                                                  " AND table_name = '"
                                                  (:table scratch-spec) "'")}})]
          (is (= 0 (ffirst (get-in post-result [:data :rows])))
              "real scratch table should be dropped even when mapping has a non-existent entry"))))))

;;; ---------------------------------------------------------------------------
;;; Integration: scratch-output-target (Postgres)
;;; ---------------------------------------------------------------------------

(deftest scratch-output-target-test
  (mt/test-drivers #{:postgres}
    (testing "scratch-output-target returns a spec with the right shape"
      (let [nonce    (scratch/new-nonce)
            schema   "public"
            target   (scratch/scratch-output-target schema nonce)]
        (is (= "public" (:schema target)))
        (is (scratch/test-table-name? (:table target))
            "output target name should pass test-table-name?")
        (is (str/ends-with? (:table target) "_out")
            "output target name should end with _out")))))

;;; ---------------------------------------------------------------------------
;;; Integration: janitor (cleanup-all-test-tables!) selectivity
;;; ---------------------------------------------------------------------------

(defn- table-exists-in-schema?
  "Check whether `table-name` exists in `schema` on the postgres test DB."
  [db-id schema table-name]
  (let [result (qp/process-query
                {:database db-id
                 :type :native
                 :native {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                      " WHERE table_schema = '" schema "'"
                                      " AND table_name = '" table-name "'")}})]
    (= 1 (ffirst (get-in result [:data :rows])))))

(deftest janitor-selectivity-test
  (mt/test-drivers #{:postgres}
    (testing "cleanup-all-test-tables! drops only old test tables, not young, production-prefix, or ordinary tables"
      (let [db-id  (mt/id)
            db     (mt/db)
            schema "public"

            ;; 1. Young test table (timestamp = now) — must not be dropped
            young-nonce  (scratch/new-nonce)
            young-name   (scratch/scratch-table-name young-nonce "in_1")

            ;; 2. Old test table (timestamp = 2h ago) — must be dropped
            two-hours-ago-secs (- (quot (System/currentTimeMillis) 1000) 7200)
            old-epoch36  (Long/toString two-hours-ago-secs 36)
            old-nonce    (scratch/new-nonce)
            old-name     (str transforms-base.u/transform-temp-table-prefix
                              "_test_" old-epoch36 "_" old-nonce "_in_2")

            ;; 3. Production-prefix table (no _test_ segment) — must not be dropped
            prod-name    (str transforms-base.u/transform-temp-table-prefix "_1781129582000")

            ;; 4. Ordinary table — must not be dropped
            ordinary-name "janitor_test_ordinary_tbl"

            ;; Helper: create a table with a minimal schema.
            ;; create-table-from-schema! uses :type (not :base-type) for column types.
            create-table! (fn [tbl-name]
                            (let [tbl-kw (keyword schema tbl-name)
                                  schema-map {:name    tbl-kw
                                              :columns [{:name "id" :type :type/Integer :nullable? true}]}]
                              (transforms-base.u/create-table-from-schema! :postgres db-id schema-map)))]
        (try
          ;; Create all 4 tables
          (create-table! young-name)
          (create-table! old-name)
          (create-table! prod-name)
          (create-table! ordinary-name)
          ;; Verify all exist
          (is (table-exists-in-schema? db-id schema young-name)    "young test table created")
          (is (table-exists-in-schema? db-id schema old-name)      "old test table created")
          (is (table-exists-in-schema? db-id schema prod-name)     "production-prefix table created")
          (is (table-exists-in-schema? db-id schema ordinary-name) "ordinary table created")
          ;; Run janitor with 1-hour min-age
          (let [report (scratch/cleanup-all-test-tables! db-id db schema {:min-age-seconds 3600})]
            ;; Old test table should be in :dropped
            (is (contains? (set (:dropped report)) old-name)
                (str "old test table should be in :dropped; report=" (pr-str report)))
            ;; Young test table should be in :skipped-young
            (is (contains? (set (:skipped-young report)) young-name)
                (str "young test table should be in :skipped-young; report=" (pr-str report)))
            ;; Non-test tables should be in :non-matching
            (is (pos? (:non-matching-count report))
                "non-matching count should be positive"))
          ;; Assert after janitor:
          (is (not (table-exists-in-schema? db-id schema old-name))
              "old test table should be dropped")
          (is (table-exists-in-schema? db-id schema young-name)
              "young test table should survive")
          (is (table-exists-in-schema? db-id schema prod-name)
              "production-prefix table should survive")
          (is (table-exists-in-schema? db-id schema ordinary-name)
              "ordinary table should survive")
          (finally
            ;; Always clean up all 4, idempotent
            (doseq [tbl-name [young-name old-name prod-name ordinary-name]]
              (try
                (driver/drop-table! :postgres db-id (keyword schema tbl-name))
                (catch Exception _)))))))))

;;; ---------------------------------------------------------------------------
;;; Integration: mapping spec shape
;;; ---------------------------------------------------------------------------

(deftest mapping-spec-shape-test
  (mt/test-drivers #{:postgres}
    (testing "seed! mapping values are {:schema <string> :table <string>} maps matching verify normalization"
      (let [nonce   (scratch/new-nonce)
            db-id   (mt/id)
            db      (mt/db)
            schema  "public"
            mapping (scratch/seed! db-id db schema
                                   [{:table-info sample-table-info :fixture sample-fixture}]
                                   nonce)]
        (try
          (doseq [[real-spec scratch-spec] mapping]
            (is (string? (:schema real-spec))   "real-spec :schema is a string")
            (is (string? (:table real-spec))    "real-spec :table is a string")
            (is (string? (:schema scratch-spec)) "scratch-spec :schema is a string")
            (is (string? (:table scratch-spec))  "scratch-spec :table is a string"))
          (finally
            (scratch/cleanup! db-id db mapping nil)))))))

;;; ---------------------------------------------------------------------------
;;; Regression: list-tables-in-schema must not interpolate schema
;;; ---------------------------------------------------------------------------

(deftest list-tables-in-schema-uses-parameterized-query-test
  ;; Regression: list-tables-in-schema was building SQL by string-interpolating
  ;; the schema name directly into the WHERE clause: `WHERE table_schema = '<schema>'`.
  ;; A schema value like "pub'lic" would produce malformed SQL (`... = 'pub'lic'`),
  ;; causing a syntax error that crashes the janitor without cleaning up old test tables.
  ;; Fix: use a parameterized query `{:query "... WHERE table_schema = ?" :params [schema]}`.
  ;;
  ;; Since list-tables-in-schema is private, we intercept qp/process-query to inspect
  ;; the query map it actually submits.
  (testing "list-tables-in-schema submits a parameterized query (schema in :params, not interpolated)"
    (let [captured-queries (atom [])
          ;; Intercept qp/process-query to capture the query map without executing
          fake-process (fn [query]
                         (swap! captured-queries conj query)
                         ;; Return a minimal successful result so the caller can proceed
                         {:status :completed
                          :data   {:cols [{:name "table_name"}]
                                   :rows []}})]
      (with-redefs [qp/process-query fake-process]
        ;; cleanup-all-test-tables! calls list-tables-in-schema internally
        ;; Use a schema string with a single quote — this is the injection vector
        (scratch/cleanup-all-test-tables! 1 {:engine "postgres"} "pub'lic" {}))
      (is (= 1 (count @captured-queries))
          "exactly one query should have been submitted")
      (let [q (first @captured-queries)
            native (:native q)]
        ;; The schema must appear in :params, not embedded in the :query string
        (is (= ["pub'lic"] (:params native))
            "schema string must be a parameter, not interpolated into SQL")
        (is (not (str/includes? (:query native) "pub'lic"))
            "the schema value must not appear literally in the query string")
        (is (str/includes? (:query native) "?")
            "the query must use a ? placeholder for the schema parameter")))))
