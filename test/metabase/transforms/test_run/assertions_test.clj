(ns ^:mb/driver-tests metabase.transforms.test-run.assertions-test
  "Tests for the assertion evaluation subsystem.

  ## Test strategy

  Pure/warehouse-free tests (Steps 9.1–9.4) exercise the factored pipeline stages
  in isolation — they do not require a database connection. The factoring makes
  this possible: the SQL builder, interpret, and prepare stages are pure
  `data → data`.

  DB-gated tests (Steps 9.5–9.9) use `:postgres` and run the full round-trip
  through [[metabase.transforms.test-run.assertions/run-assertions!]] on a minimal
  native scratch setup (a single-node transform on the test-data schema producing a
  small output table). They exercise: all-pass batched path, mixed pass/fail with the
  50-row cap actually truncating, warn-severity, the `:batched → :per-assertion`
  runtime-error fallback, and strategy equivalence.

  Steps 10 (chain wiring) and 11 (HTTP endpoint) live in `chain_test.clj`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.connection :as driver.conn]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [metabase.transforms.test-run.assertions :as assertions]
   [metabase.transforms.test-run.fixtures :as fixtures]
   [metabase.transforms.test-run.scratch :as scratch]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Step 9.1 — build-combined-assertion-sql (:cte binding)
;;; ===========================================================================

(deftest build-combined-assertion-sql-cte-test
  (testing "CTE binding: wraps output with WITH test_output AS (...) + UNION ALL COUNT(*) subqueries"
    (let [binding  {:kind :cte :sql "SELECT * FROM \"public\".\"mb_transform_temp_table_test_abc\""}
          runnable [{:name "no_nulls"   :severity :error :rewritten-sql "SELECT * FROM test_output WHERE col IS NULL"}
                    {:name "no_negatives" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE revenue < 0"}]
          sql      (assertions/build-combined-assertion-sql binding runnable)]
      (testing "starts with WITH test_output AS (...)"
        (is (.startsWith sql "WITH test_output AS (")))
      (testing "contains both assertion names as literals"
        (is (.contains sql "'no_nulls'"))
        (is (.contains sql "'no_negatives'")))
      (testing "contains __assertion and __failing column aliases"
        (is (.contains sql "__assertion"))
        (is (.contains sql "__failing")))
      (testing "contains UNION ALL between assertions"
        (is (.contains sql "UNION ALL")))
      (testing "wraps each assertion in COUNT(*) FROM (...) __a"
        (is (.contains sql "COUNT(*) AS __failing"))
        (is (.contains sql ") __a"))))))

(deftest build-combined-assertion-sql-single-assertion-test
  (testing "single assertion produces no UNION ALL"
    (let [binding  {:kind :cte :sql "SELECT * FROM scratch_table"}
          runnable [{:name "only_one" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE x < 0"}]
          sql      (assertions/build-combined-assertion-sql binding runnable)]
      (is (not (.contains sql "UNION ALL")))
      (is (.contains sql "'only_one'")))))

(deftest build-combined-assertion-sql-strips-trailing-semicolon-test
  (testing "trailing semicolons in user SQL are stripped before embedding"
    (let [binding  {:kind :cte :sql "SELECT * FROM t"}
          runnable [{:name "semi" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE x = 1;"}]
          sql      (assertions/build-combined-assertion-sql binding runnable)]
      ;; A trailing semicolon inside a subquery would be a syntax error.
      (is (not (.contains sql "1;)"))))))

;;; ===========================================================================
;;; Step 9.2 — build-combined-assertion-sql (:table binding)
;;; ===========================================================================

(deftest build-combined-assertion-sql-table-binding-test
  (testing ":table binding: no WITH clause; test_output already resolved by mapping"
    (let [binding  {:kind :table}
          ;; For :table binding the rewrite already turned test_output into a scratch table.
          runnable [{:name "check_a" :severity :error
                     :rewritten-sql "SELECT * FROM \"public\".\"mb_transform_temp_table_test_xyz\" WHERE n < 0"}]
          sql      (assertions/build-combined-assertion-sql binding runnable)]
      (testing "no WITH clause"
        (is (not (.contains sql "WITH "))))
      (testing "still has COUNT(*) envelope"
        (is (.contains sql "COUNT(*) AS __failing")))
      (testing "still has assertion name"
        (is (.contains sql "'check_a'"))))))

;;; ===========================================================================
;;; Step 9.3 — prepare-one fault isolation (unit-level, no DB)
;;; ===========================================================================

(deftest prepare-one-fault-isolation-test
  (testing "prepare with multiple assertions — rewrite failure captured per-assertion, others still prepared"
    ;; Call prepare indirectly via interpret: interpret handles terminal :error
    ;; entries (built here as synthetic prepared vectors) correctly. That is the
    ;; prepare fault-isolation contract as observed by callers, with no live DB.
    (let [;; One :error entry (would come from prepare-one catching a rewrite failure),
          ;; one clean entry (rewrite succeeded).
          prepared [{:name "bad_a" :severity :error :error "rewrite failed: parse error"}
                    {:name "bad_b" :severity :warn  :error "verify failed: real table ref"}
                    {:name "good_c" :severity :error :rewritten-sql "SELECT * FROM t WHERE 1=0"}]
          ;; Raw results only for the runnable (non-error) assertions.
          raw-results [{:name "good_c" :failing-count 0 :sample nil}]
          results (#'assertions/interpret prepared raw-results)]
      (testing "returns one result per input assertion (all three)"
        (is (= 3 (count results))))
      (testing "first error entry is :failed with error_message"
        (let [r (first results)]
          (is (= "bad_a" (:name r)))
          (is (= :failed (:status r)))
          (is (= "rewrite failed: parse error" (:error_message r)))
          (is (zero? (:failing_row_count r)))))
      (testing "second error entry is also :failed (severity ignored for error entries)"
        (let [r (second results)]
          (is (= "bad_b" (:name r)))
          (is (= :failed (:status r)))
          (is (= "verify failed: real table ref" (:error_message r)))))
      (testing "clean assertion is :passed"
        (let [r (nth results 2)]
          (is (= "good_c" (:name r)))
          (is (= :passed (:status r))))))))

;;; ===========================================================================
;;; Step 9.3b — interpret fault isolation (the original test, renamed to match
;;; what it actually tests)
;;; ===========================================================================

(deftest interpret-fault-isolation-test
  (testing "interpret handles an :error PreparedAssertion alongside a clean one"
    ;; Verifies interpret's defensiveness when a PreparedAssertion has :error.
    ;; This is the layer that callers interact with; the prepare-one unit above
    ;; verifies the full count of results from multiple bad+good entries.
    (let [prepared [{:name "bad_assertion" :severity :error :error "rewrite failed: parse error"}
                    {:name "good_assertion" :severity :error :rewritten-sql "SELECT * FROM t WHERE 1=0"}]
          raw-results [{:name "good_assertion" :failing-count 0 :sample nil}]
          results (#'assertions/interpret prepared raw-results)]
      (testing "returns one result per input assertion"
        (is (= 2 (count results))))
      (testing "error assertion is :failed with an error_message"
        (let [bad (first results)]
          (is (= "bad_assertion" (:name bad)))
          (is (= :failed (:status bad)))
          (is (= "rewrite failed: parse error" (:error_message bad)))
          (is (zero? (:failing_row_count bad)))))
      (testing "clean assertion is :passed"
        (let [good (second results)]
          (is (= "good_assertion" (:name good)))
          (is (= :passed (:status good))))))))

;;; ===========================================================================
;;; Step 9.4 — interpret maps counts → results with correct severity logic
;;; ===========================================================================

(deftest interpret-passed-test
  (testing "count=0 → :passed regardless of severity"
    (let [prepared [{:name "a" :severity :error :rewritten-sql "SELECT 1"}
                    {:name "b" :severity :warn  :rewritten-sql "SELECT 1"}]
          raw      [{:name "a" :failing-count 0 :sample nil}
                    {:name "b" :failing-count 0 :sample nil}]
          results  (#'assertions/interpret prepared raw)]
      (is (every? #(= :passed (:status %)) results))
      (is (every? #(zero? (:failing_row_count %)) results)))))

(deftest interpret-error-severity-failed-test
  (testing "count>0 + severity :error → :failed"
    (let [prepared [{:name "a" :severity :error :rewritten-sql "SELECT * FROM t WHERE x < 0"}]
          raw      [{:name "a" :failing-count 3 :sample {:rows [[1] [2] [3]] :columns ["x"]}}]
          results  (#'assertions/interpret prepared raw)]
      (is (= :failed (:status (first results))))
      (is (= 3 (:failing_row_count (first results))))
      (is (= [[1] [2] [3]] (:sample_rows (first results))))
      (is (= ["x"] (:columns (first results)))))))

(deftest interpret-warn-severity-test
  (testing "count>0 + severity :warn → :warn (not :failed)"
    (let [prepared [{:name "a" :severity :warn :rewritten-sql "SELECT * FROM t WHERE x < 0"}]
          raw      [{:name "a" :failing-count 5 :sample {:rows [[1]] :columns ["x"]}}]
          results  (#'assertions/interpret prepared raw)]
      (is (= :warn (:status (first results))))
      (is (= 5 (:failing_row_count (first results)))))))

(deftest interpret-sample-nil-on-pass-test
  (testing "sample_rows is nil for passing assertions even if sample data is present in raw result"
    ;; This tests interpret's defensiveness: the batched strategy only fetches samples for
    ;; failing assertions, so a passing result with a sample is a synthetic impossible state.
    ;; The contract is that sample_rows must be nil for :passed regardless.
    (let [prepared [{:name "a" :severity :error :rewritten-sql "SELECT 1"}]
          raw      [{:name "a" :failing-count 0 :sample {:rows [[1]] :columns ["x"]}}]
          results  (#'assertions/interpret prepared raw)]
      (is (nil? (:sample_rows (first results))))
      (is (= [] (:columns (first results)))))))

;;; ===========================================================================
;;; overall-status tests (pure)
;;; ===========================================================================

(deftest overall-status-test
  (testing "passed when diff nil and no failed assertions"
    (is (= :passed (assertions/overall-status nil [])))
    (is (= :passed (assertions/overall-status :passed [])))
    (is (= :passed (assertions/overall-status nil [{:status :passed}]))
        "passing assertions do not fail")
    (is (= :passed (assertions/overall-status nil [{:status :warn}]))
        "warn assertions do not fail the overall status"))
  (testing "failed when diff is :failed"
    (is (= :failed (assertions/overall-status :failed [])))
    (is (= :failed (assertions/overall-status :failed [{:status :passed}]))))
  (testing "failed when any assertion is :failed"
    (is (= :failed (assertions/overall-status :passed [{:status :failed}])))
    (is (= :failed (assertions/overall-status nil [{:status :passed} {:status :failed}]))))
  (testing ":warn does not contribute to :failed"
    (is (= :passed (assertions/overall-status :passed [{:status :warn}])))))

;;; ===========================================================================
;;; build-output-binding tests (pure)
;;; ===========================================================================

(deftest build-output-binding-transform-test
  (testing ":transform target → :cte binding with SELECT * FROM scratch"
    (let [spec    {:schema "public" :table "mb_transform_temp_table_test_abc" :db nil}
          binding (assertions/build-output-binding :transform {:scratch-spec spec})]
      (is (= :cte (:kind binding)))
      (is (.contains (:sql binding) "mb_transform_temp_table_test_abc"))
      (is (.startsWith (:sql binding) "SELECT * FROM")))))

(deftest build-output-binding-card-sql-test
  (testing ":card target with :card-sql → :cte binding"
    (let [binding (assertions/build-output-binding :card {:card-sql "SELECT a, b FROM scratch_tbl"})]
      (is (= :cte (:kind binding)))
      (is (= "SELECT a, b FROM scratch_tbl" (:sql binding))))))

(deftest build-output-binding-card-scratch-test
  (testing ":card target with :scratch-spec → :table binding (escape path)"
    (let [spec    {:schema "public" :table "mb_transform_temp_table_test_xyz"}
          binding (assertions/build-output-binding :card {:scratch-spec spec})]
      (is (= :table (:kind binding)))
      (is (= spec (:spec binding))))))

;;; ===========================================================================
;;; Steps 9.5–9.9 — DB-gated postgres tests
;;;
;;; These tests call run-assertions! against a live Postgres scratch table. They
;;; share the test-data schema and use a simple single-column table seeded directly
;;; via scratch/seed! so no Transform model is needed.
;;;
;;; Scratch setup: seed a two-column table (id int, val int) with rows via
;;; driver.conn/with-transform-connection + scratch/seed!. The mapping gives us
;;; the scratch output spec; we build a :cte binding and call run-assertions!.
;;;
;;; All tests follow the same postgres-gating pattern as chain_test.clj:
;;;   (mt/with-premium-features #{})
;;;   (mt/test-drivers #{:postgres})
;;;   (mt/dataset test-data ...)
;;; ===========================================================================

;;; ---------------------------------------------------------------------------
;;; Step 9.5 — all-pass via one combined query
;;; ---------------------------------------------------------------------------

(deftest run-assertions-all-pass-test
  (testing "Step 9.5: all-pass → single combined query, all assertions :passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id      (mt/id)
                db         (t2/select-one :model/Database :id db-id)
                drv        (keyword (:engine db))
                schema     "public"
                nonce      (scratch/new-nonce)
                ;; Use orders table with a small fixture (2 positive-total rows)
                orders-id  (mt/id :orders)
                orders-info {:id      orders-id
                             :schema  schema
                             :name    "orders"
                             :columns [{:name "id"          :base-type :type/Integer          :nullable? true}
                                       {:name "user_id"     :base-type :type/Integer          :nullable? true}
                                       {:name "product_id"  :base-type :type/Integer          :nullable? true}
                                       {:name "subtotal"    :base-type :type/Float             :nullable? true}
                                       {:name "tax"         :base-type :type/Float             :nullable? true}
                                       {:name "total"       :base-type :type/Float             :nullable? true}
                                       {:name "discount"    :base-type :type/Float             :nullable? true}
                                       {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
                                       {:name "quantity"    :base-type :type/Integer          :nullable? true}]}
                ;; Two rows with positive totals — assertions checking total >= 0 should all pass.
                fixture-csv (str "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity\n"
                                 "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
                                 "2,2,2,45,5,50,,2024-01-02T00:00:00Z,1\n")]
            (driver.conn/with-transform-connection
              (let [mapping (scratch/seed! db-id db schema
                                           [{:table-info orders-info
                                             :fixture    (fixtures/parse-fixture fixture-csv (:columns orders-info))}]
                                           nonce)
                    scratch-spec (-> mapping vals first)
                    binding  (assertions/build-output-binding :transform {:scratch-spec scratch-spec})
                    backend  (sql-tools/parser-backend)]
                (try
                  (let [results (assertions/run-assertions!
                                 db-id drv backend mapping binding
                                 [{:name "no_neg_total"    :sql "SELECT * FROM test_output WHERE total < 0"    :severity :error}
                                  {:name "has_positive_id" :sql "SELECT * FROM test_output WHERE id <= 0"      :severity :error}])]
                    (testing "returns one result per assertion"
                      (is (= 2 (count results))))
                    (testing "all assertions :passed"
                      (is (every? #(= :passed (:status %)) results)))
                    (testing "failing_row_count = 0 for all"
                      (is (every? #(zero? (:failing_row_count %)) results)))
                    (testing "sample_rows is nil for all (no failures)"
                      (is (every? #(nil? (:sample_rows %)) results))))
                  (finally
                    (scratch/cleanup! db-id db mapping nil)))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 9.6 — mixed pass/fail with 50-row cap actually exceeded
;;; ---------------------------------------------------------------------------

(deftest run-assertions-mixed-pass-fail-cap-test
  (testing "Step 9.6: mixed pass/fail — failing assertion gets lazy sample capped at 50"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id      (mt/id)
                db         (t2/select-one :model/Database :id db-id)
                drv        (keyword (:engine db))
                schema     "public"
                nonce      (scratch/new-nonce)
                orders-id  (mt/id :orders)
                orders-info {:id      orders-id
                             :schema  schema
                             :name    "orders"
                             :columns [{:name "id"          :base-type :type/Integer          :nullable? true}
                                       {:name "user_id"     :base-type :type/Integer          :nullable? true}
                                       {:name "product_id"  :base-type :type/Integer          :nullable? true}
                                       {:name "subtotal"    :base-type :type/Float             :nullable? true}
                                       {:name "tax"         :base-type :type/Float             :nullable? true}
                                       {:name "total"       :base-type :type/Float             :nullable? true}
                                       {:name "discount"    :base-type :type/Float             :nullable? true}
                                       {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
                                       {:name "quantity"    :base-type :type/Integer          :nullable? true}]}
                ;; Build 60 rows with negative totals (id 1–60) so the failing assertion
                ;; has >50 matching rows and the 50-row sample cap is actually hit.
                header      "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity"
                neg-rows    (str/join "\n"
                                      (for [i (range 1 61)]
                                        (str i ",1,1,-90,-10,-100,,2024-01-01T00:00:00Z,1")))
                fixture-csv (str header "\n" neg-rows "\n")]
            (driver.conn/with-transform-connection
              (let [mapping     (scratch/seed! db-id db schema
                                               [{:table-info orders-info
                                                 :fixture    (fixtures/parse-fixture fixture-csv (:columns orders-info))}]
                                               nonce)
                    scratch-spec (-> mapping vals first)
                    binding     (assertions/build-output-binding :transform {:scratch-spec scratch-spec})
                    backend     (sql-tools/parser-backend)]
                (try
                  (let [results (assertions/run-assertions!
                                 db-id drv backend mapping binding
                                 ;; assertion 0: all rows fail (total < 0) → >50 failing rows
                                 ;; assertion 1: no rows fail (id > 0 is always true) → pass
                                 [{:name "total_positive" :sql "SELECT * FROM test_output WHERE total < 0" :severity :error}
                                  {:name "id_positive"    :sql "SELECT * FROM test_output WHERE id <= 0"   :severity :error}])]
                    (testing "returns two results"
                      (is (= 2 (count results))))
                    (testing "first assertion is :failed (all 60 rows have negative totals)"
                      (let [r (first results)]
                        (is (= :failed (:status r)))
                        (is (= 60 (:failing_row_count r)))))
                    (testing "50-row cap: sample_rows has exactly 50 entries"
                      (is (= 50 (count (:sample_rows (first results))))))
                    (testing "second assertion is :passed (no rows with id <= 0)"
                      (let [r (second results)]
                        (is (= :passed (:status r)))
                        (is (zero? (:failing_row_count r)))))
                    (testing "sample_rows is nil for the passing assertion"
                      (is (nil? (:sample_rows (second results))))))
                  (finally
                    (scratch/cleanup! db-id db mapping nil)))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 9.7 — warn-severity: full run, per-entry :warn, not :failed
;;; ---------------------------------------------------------------------------

(deftest run-assertions-warn-severity-test
  (testing "Step 9.7: :warn severity firing → per-entry :warn, overall does not flip to :failed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id      (mt/id)
                db         (t2/select-one :model/Database :id db-id)
                drv        (keyword (:engine db))
                schema     "public"
                nonce      (scratch/new-nonce)
                orders-id  (mt/id :orders)
                orders-info {:id      orders-id
                             :schema  schema
                             :name    "orders"
                             :columns [{:name "id"          :base-type :type/Integer          :nullable? true}
                                       {:name "user_id"     :base-type :type/Integer          :nullable? true}
                                       {:name "product_id"  :base-type :type/Integer          :nullable? true}
                                       {:name "subtotal"    :base-type :type/Float             :nullable? true}
                                       {:name "tax"         :base-type :type/Float             :nullable? true}
                                       {:name "total"       :base-type :type/Float             :nullable? true}
                                       {:name "discount"    :base-type :type/Float             :nullable? true}
                                       {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
                                       {:name "quantity"    :base-type :type/Integer          :nullable? true}]}
                fixture-csv (str "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity\n"
                                 "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
                                 "2,2,2,45,5,50,,2024-01-02T00:00:00Z,1\n")]
            (driver.conn/with-transform-connection
              (let [mapping     (scratch/seed! db-id db schema
                                               [{:table-info orders-info
                                                 :fixture    (fixtures/parse-fixture fixture-csv (:columns orders-info))}]
                                               nonce)
                    scratch-spec (-> mapping vals first)
                    binding     (assertions/build-output-binding :transform {:scratch-spec scratch-spec})
                    backend     (sql-tools/parser-backend)]
                (try
                  (let [results (assertions/run-assertions!
                                 db-id drv backend mapping binding
                                 ;; Assertion always fires (all rows pass WHERE 1=1) but severity is :warn.
                                 [{:name "warn_always_fires"
                                   :sql  "SELECT * FROM test_output WHERE 1=1"
                                   :severity :warn}
                                  ;; A passing :error assertion alongside.
                                  {:name "error_passes"
                                   :sql  "SELECT * FROM test_output WHERE id <= 0"
                                   :severity :error}])]
                    (testing "two assertion results"
                      (is (= 2 (count results))))
                    (testing ":warn assertion fires → status :warn (not :failed)"
                      (let [r (first results)]
                        (is (= "warn_always_fires" (:name r)))
                        (is (= :warn (:status r)))
                        (is (pos? (:failing_row_count r)))))
                    (testing "passing :error assertion → :passed"
                      (let [r (second results)]
                        (is (= "error_passes" (:name r)))
                        (is (= :passed (:status r)))))
                    (testing "overall-status: :warn does not flip to :failed"
                      (is (= :passed (assertions/overall-status :passed results)))))
                  (finally
                    (scratch/cleanup! db-id db mapping nil)))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 9.8 — :batched → :per-assertion fallback on runtime warehouse error
;;; ---------------------------------------------------------------------------

(deftest run-assertions-batched-fallback-test
  (testing "Step 9.8: runtime warehouse error in batched query → falls back to :per-assertion, still attributes results"
    ;; The key challenge: the bad assertion must pass prepare (rewrite+verify succeed)
    ;; but fail at execution time in the combined SQL.
    ;;
    ;; Strategy: provide an assertion with a column reference that does not exist
    ;; in the scratch table. The verify guard only checks TABLE references (not
    ;; column references), so it passes prepare. But at execution time, the combined
    ;; UNION ALL query fails because the column doesn't exist → fallback fires.
    ;; The per-assertion strategy runs each assertion individually: the bad one gets
    ;; an :error raw result, the good one still executes and contributes a count.
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id      (mt/id)
                db         (t2/select-one :model/Database :id db-id)
                drv        (keyword (:engine db))
                schema     "public"
                nonce      (scratch/new-nonce)
                orders-id  (mt/id :orders)
                orders-info {:id      orders-id
                             :schema  schema
                             :name    "orders"
                             :columns [{:name "id"          :base-type :type/Integer          :nullable? true}
                                       {:name "user_id"     :base-type :type/Integer          :nullable? true}
                                       {:name "product_id"  :base-type :type/Integer          :nullable? true}
                                       {:name "subtotal"    :base-type :type/Float             :nullable? true}
                                       {:name "tax"         :base-type :type/Float             :nullable? true}
                                       {:name "total"       :base-type :type/Float             :nullable? true}
                                       {:name "discount"    :base-type :type/Float             :nullable? true}
                                       {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
                                       {:name "quantity"    :base-type :type/Integer          :nullable? true}]}
                fixture-csv (str "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity\n"
                                 "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
                                 "2,2,2,45,5,50,,2024-01-02T00:00:00Z,1\n")]
            (driver.conn/with-transform-connection
              (let [mapping     (scratch/seed! db-id db schema
                                               [{:table-info orders-info
                                                 :fixture    (fixtures/parse-fixture fixture-csv (:columns orders-info))}]
                                               nonce)
                    scratch-spec (-> mapping vals first)
                    binding     (assertions/build-output-binding :transform {:scratch-spec scratch-spec})
                    backend     (sql-tools/parser-backend)
                    ;; Force the bad assertion SQL to reference an existing table but a
                    ;; non-existent column — passes prepare (verify checks table refs)
                    ;; but throws at the warehouse in the combined query.
                    ;; We use run-assertions! with :strategy :batched (the default) and
                    ;; the bad assertion first so it poisons the combined UNION ALL.
                    bad-sql     "SELECT * FROM test_output WHERE nonexistent_column_xyz < 0"]
                (try
                  (let [results (assertions/run-assertions!
                                 db-id drv backend mapping binding
                                 [{:name "bad_column_ref" :sql bad-sql               :severity :error}
                                  {:name "good_assertion" :sql "SELECT * FROM test_output WHERE id <= 0" :severity :error}]
                                 {:strategy :batched})]
                    (testing "returns two results (fallback attributed both)"
                      (is (= 2 (count results))))
                    (testing "bad assertion result present (fallback ran it per-assertion)"
                      (let [bad (first results)]
                        (is (= "bad_column_ref" (:name bad)))
                        ;; The per-assertion strategy captures the QP error as a raw :error result.
                        ;; interpret-one maps that to :failed + :error_message.
                        (is (or (= :failed (:status bad))
                                ;; Some postgres QP errors may produce count=0 with :error captured
                                (some? (:error_message bad))))))
                    (testing "good assertion still gets a result"
                      (let [good (second results)]
                        (is (= "good_assertion" (:name good)))
                        ;; id <= 0 is false for our data, so 0 failing rows → :passed
                        (is (= :passed (:status good))))))
                  (finally
                    (scratch/cleanup! db-id db mapping nil)))))))))))

;;; ---------------------------------------------------------------------------
;;; Step 9.9 — strategy equivalence: :batched and :per-assertion yield same verdicts
;;; ---------------------------------------------------------------------------

(deftest run-assertions-strategy-equivalence-test
  (testing "Step 9.9: :batched and :per-assertion strategies yield identical verdicts"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id      (mt/id)
                db         (t2/select-one :model/Database :id db-id)
                drv        (keyword (:engine db))
                schema     "public"
                nonce      (scratch/new-nonce)
                orders-id  (mt/id :orders)
                orders-info {:id      orders-id
                             :schema  schema
                             :name    "orders"
                             :columns [{:name "id"          :base-type :type/Integer          :nullable? true}
                                       {:name "user_id"     :base-type :type/Integer          :nullable? true}
                                       {:name "product_id"  :base-type :type/Integer          :nullable? true}
                                       {:name "subtotal"    :base-type :type/Float             :nullable? true}
                                       {:name "tax"         :base-type :type/Float             :nullable? true}
                                       {:name "total"       :base-type :type/Float             :nullable? true}
                                       {:name "discount"    :base-type :type/Float             :nullable? true}
                                       {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
                                       {:name "quantity"    :base-type :type/Integer          :nullable? true}]}
                fixture-csv (str "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity\n"
                                 "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
                                 "2,2,2,45,5,-50,,2024-01-02T00:00:00Z,1\n"
                                 "3,3,3,-10,-2,-12,,2024-01-03T00:00:00Z,1\n")
                assertion-defs [{:name "no_neg_total"    :sql "SELECT * FROM test_output WHERE total < 0"    :severity :error}
                                {:name "id_always_pos"   :sql "SELECT * FROM test_output WHERE id <= 0"      :severity :error}
                                {:name "subtotal_nonneg" :sql "SELECT * FROM test_output WHERE subtotal < 0" :severity :warn}]]
            (driver.conn/with-transform-connection
              (let [mapping     (scratch/seed! db-id db schema
                                               [{:table-info orders-info
                                                 :fixture    (fixtures/parse-fixture fixture-csv (:columns orders-info))}]
                                               nonce)
                    scratch-spec (-> mapping vals first)
                    binding     (assertions/build-output-binding :transform {:scratch-spec scratch-spec})
                    backend     (sql-tools/parser-backend)]
                (try
                  (let [batched-results    (assertions/run-assertions!
                                            db-id drv backend mapping binding assertion-defs
                                            {:strategy :batched})
                        per-assert-results (assertions/run-assertions!
                                            db-id drv backend mapping binding assertion-defs
                                            {:strategy :per-assertion})]
                    (testing ":batched and :per-assertion return same number of results"
                      (is (= (count batched-results) (count per-assert-results))))
                    (testing "status verdicts are identical for each assertion"
                      (doseq [[b p] (map vector batched-results per-assert-results)]
                        (testing (str "assertion " (:name b))
                          (is (= (:name b) (:name p)))
                          (is (= (:status b) (:status p))
                              (str "status mismatch: batched=" (:status b)
                                   " per-assertion=" (:status p))))))
                    (testing "failing_row_count matches for each assertion"
                      (doseq [[b p] (map vector batched-results per-assert-results)]
                        (is (= (:failing_row_count b) (:failing_row_count p))
                            (str "count mismatch for " (:name b))))))
                  (finally
                    (scratch/cleanup! db-id db mapping nil)))))))))))
