(ns ^:mb/driver-tests metabase-enterprise.transforms-verification.assertions-test
  "Tests for the assertion evaluation subsystem
  ([[metabase-enterprise.transforms-verification.assertions]]). Some are pure (no database); the
  driver-gated tests run the full round-trip through `run-assertions!`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.assertions :as assertions]
   [metabase-enterprise.transforms-verification.fixtures :as fixtures]
   [metabase-enterprise.transforms-verification.resolve :as resolve]
   [metabase-enterprise.transforms-verification.scratch :as scratch]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.driver.connection :as driver.conn]
   [metabase.query-processor.core :as qp]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; build-combined-assertion-sql
;;; ===========================================================================

(deftest build-combined-assertion-sql-test
  (testing "wraps output-sql with WITH test_output AS (...) + UNION ALL COUNT(*) subqueries"
    (let [output-sql "SELECT * FROM \"public\".\"mb_transform_temp_table_test_abc\""
          runnable   [{:name "no_nulls"   :severity :error :rewritten-sql "SELECT * FROM test_output WHERE col IS NULL"}
                      {:name "no_negatives" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE revenue < 0"}]
          sql        (assertions/build-combined-assertion-sql output-sql runnable)]
      (testing "starts with WITH test_output AS (...)"
        (is (str/starts-with? sql "WITH test_output AS (")))
      (testing "labels rows by ordinal index, not by name"
        (is (str/includes? sql "0 AS __assertion"))
        (is (str/includes? sql "1 AS __assertion"))
        (is (not (str/includes? sql "'no_nulls'")))
        (is (not (str/includes? sql "'no_negatives'"))))
      (testing "contains __assertion and __failing column aliases"
        (is (str/includes? sql "__assertion"))
        (is (str/includes? sql "__failing")))
      (testing "contains UNION ALL between assertions"
        (is (str/includes? sql "UNION ALL")))
      (testing "wraps each assertion in COUNT(*) FROM (...) __a"
        (is (str/includes? sql "COUNT(*) AS __failing"))
        (is (str/includes? sql ") __a"))))))

(deftest build-combined-assertion-sql-single-assertion-test
  (testing "single assertion produces no UNION ALL"
    (let [sql (assertions/build-combined-assertion-sql
               "SELECT * FROM scratch_table"
               [{:name "only_one" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE x < 0"}])]
      (is (not (str/includes? sql "UNION ALL")))
      (is (str/includes? sql "0 AS __assertion"))
      (is (not (str/includes? sql "'only_one'"))))))

(deftest build-combined-assertion-sql-strips-trailing-semicolon-test
  (testing "trailing semicolons in user SQL are stripped before embedding"
    (let [sql (assertions/build-combined-assertion-sql
               "SELECT * FROM t"
               [{:name "semi" :severity :error :rewritten-sql "SELECT * FROM test_output WHERE x = 1;"}])]
      ;; A trailing semicolon inside a subquery would be a syntax error.
      (is (not (str/includes? sql "1;)")))
      ;; ...and the assertion SQL itself must survive the strip.
      (is (str/includes? sql "x = 1) __a")))))

(deftest build-combined-assertion-sql-no-name-injection-test
  (testing "user-supplied assertion names never appear in generated SQL (no injection surface)"
    (let [malicious "evil\\"                              ; trailing backslash
          quote-name "o'brien; DROP TABLE x--"
          runnable  [{:name malicious   :severity :error :rewritten-sql "SELECT 1 WHERE 1=0"}
                     {:name quote-name  :severity :error :rewritten-sql "SELECT 2 WHERE 1=0"}]
          sql       (assertions/build-combined-assertion-sql "SELECT 1" runnable)]
      (testing "neither name is embedded in the SQL"
        (is (not (str/includes? sql "evil")))
        (is (not (str/includes? sql "brien")))
        (is (not (str/includes? sql "DROP TABLE"))))
      (testing "rows are labelled by ordinal index instead"
        (is (str/includes? sql "0 AS __assertion"))
        (is (str/includes? sql "1 AS __assertion")))
      (testing "no stray single-quote/backslash literal survives from the name"
        ;; strip known-safe tokens, then assert no lone quote/backslash remains
        (let [scrubbed (-> sql (str/replace "__assertion" "") (str/replace "test_output" ""))]
          (is (nil? (re-find #"['\\]" scrubbed))))))))

(deftest build-combined-assertion-sql-duplicate-names-distinguished-test
  (testing "assertions sharing a name are distinguished by index, not collapsed"
    (let [runnable [{:name "dup" :severity :error :rewritten-sql "SELECT 1 WHERE 1=0"}
                    {:name "dup" :severity :error :rewritten-sql "SELECT 2 WHERE 1=0"}]
          sql      (assertions/build-combined-assertion-sql "SELECT 1" runnable)]
      (is (str/includes? sql "0 AS __assertion"))
      (is (str/includes? sql "1 AS __assertion")))))

;;; ===========================================================================
;;; prepare fault isolation (unit-level, no DB)
;;; ===========================================================================

(deftest prepare-fault-isolation-test
  (testing "prepare never throws — a rewrite failure becomes that entry's :error, others still prepare"
    (mt/with-dynamic-fn-redefs [resolve/rewrite-native-sql (fn [_driver sql _mapping _backend]
                                                             (if (str/includes? sql "boom")
                                                               (throw (ex-info "rewrite failed: parse error" {}))
                                                               (str "REWRITTEN " sql)))
                                resolve/verify             (fn [_driver _mapping _sql _safe-aliases] nil)]
      (let [prepared (#'assertions/prepare
                      :postgres :sqlglot {}
                      [{:name "bad_a"  :sql "SELECT boom" :severity :error}
                       {:name "good_b" :sql "SELECT * FROM test_output WHERE 1=0" :severity :warn}])]
        (testing "returns one entry per input assertion, in order"
          (is (= ["bad_a" "good_b"] (mapv :name prepared))))
        (testing "failed rewrite is captured as :error, not thrown"
          (let [bad (first prepared)]
            (is (= "rewrite failed: parse error" (:error bad)))
            (is (not (contains? bad :rewritten-sql)))))
        (testing "the other assertion still prepares, severity preserved"
          (let [good (second prepared)]
            (is (= "REWRITTEN SELECT * FROM test_output WHERE 1=0" (:rewritten-sql good)))
            (is (= :warn (:severity good)))
            (is (not (contains? good :error)))))))))

;;; ===========================================================================
;;; interpret fault isolation
;;; ===========================================================================

(deftest interpret-fault-isolation-test
  (testing "interpret handles :error PreparedAssertions alongside a clean one"
    (let [prepared [{:name "bad_a" :severity :error :error "rewrite failed: parse error"}
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
;;; interpret maps counts → results with correct severity logic
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
;;; run-assertions! empty-input contract (pure)
;;; ===========================================================================

(deftest run-assertions-empty-returns-vector-test
  (testing "no assertions → [] (not nil), touching neither the parser nor the DB"
    (is (= [] (assertions/run-assertions! 1 :postgres :sqlglot {} "SELECT 1" [])))
    (is (= [] (assertions/run-assertions! 1 :postgres :sqlglot {} "SELECT 1" nil)))))

;;; ===========================================================================
;;; DB-gated postgres tests — run-assertions! against a live Postgres scratch table
;;; ===========================================================================

(def ^:private orders-columns
  "Column schema for the seeded orders scratch table (matches test-data orders)."
  [{:name "id"          :base-type :type/Integer             :nullable? true}
   {:name "user_id"     :base-type :type/Integer             :nullable? true}
   {:name "product_id"  :base-type :type/Integer             :nullable? true}
   {:name "subtotal"    :base-type :type/Float               :nullable? true}
   {:name "tax"         :base-type :type/Float               :nullable? true}
   {:name "total"       :base-type :type/Float               :nullable? true}
   {:name "discount"    :base-type :type/Float               :nullable? true}
   {:name "created_at"  :base-type :type/DateTimeWithLocalTZ :nullable? true}
   {:name "quantity"    :base-type :type/Integer             :nullable? true}])

(def ^:private orders-csv-header
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

(def ^:private two-positive-orders-csv
  "Two rows with positive totals — total >= 0 assertions all pass."
  (str orders-csv-header "\n"
       "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
       "2,2,2,45,5,50,,2024-01-02T00:00:00Z,1\n"))

(defn- do-with-seeded-orders!
  "Seed a scratch copy of the orders table from `fixture-csv` on :postgres inside
  a transform connection; call `f` with `{:db-id :driver :mapping :output-sql :backend}`;
  clean up the scratch table in a finally."
  [fixture-csv f]
  (mt/with-premium-features #{}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset test-data
        (let [db-id       (mt/id)
              db          (t2/select-one :model/Database :id db-id)
              driver      (keyword (:engine db))
              schema      (tu/test-schema)
              nonce       (scratch/new-nonce)
              orders-info {:id      (mt/id :orders)
                           :schema  schema
                           :name    "orders"
                           :columns orders-columns}]
          (driver.conn/with-transform-connection
            (let [mapping    (scratch/seed! db-id db schema
                                            [{:table-info orders-info
                                              :fixture    (fixtures/parse-fixture fixture-csv orders-columns)}]
                                            nonce)
                  output-sql (str "SELECT * FROM " (scratch/spec->sql-ref driver (-> mapping vals first)))
                  backend    (sql-tools/parser-backend)]
              (try
                (f {:db-id db-id :driver driver :mapping mapping :output-sql output-sql :backend backend})
                (finally
                  (scratch/cleanup! db-id db mapping nil))))))))))

;;; ---------------------------------------------------------------------------
;;; all-pass via one combined query
;;; ---------------------------------------------------------------------------

(deftest run-assertions-all-pass-test
  (testing "all-pass → single combined query, all assertions :passed"
    (do-with-seeded-orders!
     two-positive-orders-csv
     (fn [{:keys [db-id driver mapping output-sql backend]}]
       (let [qp-calls (atom 0)
             qp-orig  (mt/original-fn #'qp/process-query)
             results  (mt/with-dynamic-fn-redefs [qp/process-query
                                                  (fn [& args]
                                                    (swap! qp-calls inc)
                                                    (apply qp-orig args))]
                        (assertions/run-assertions!
                         db-id driver backend mapping output-sql
                         [{:name "no_neg_total"    :sql "SELECT * FROM test_output WHERE total < 0" :severity :error}
                          {:name "has_positive_id" :sql "SELECT * FROM test_output WHERE id <= 0"   :severity :error}]))]
         (testing "one combined QP round-trip for both assertions"
           (is (= 1 @qp-calls)))
         (testing "returns one result per assertion"
           (is (= 2 (count results))))
         (testing "all assertions :passed"
           (is (every? #(= :passed (:status %)) results)))
         (testing "failing_row_count = 0 for all"
           (is (every? #(zero? (:failing_row_count %)) results)))
         (testing "sample_rows is nil for all (no failures)"
           (is (every? #(nil? (:sample_rows %)) results))))))))

;;; ---------------------------------------------------------------------------
;;; mixed pass/fail with the sample cap actually exceeded
;;; ---------------------------------------------------------------------------

(deftest run-assertions-mixed-pass-fail-cap-test
  (testing "mixed pass/fail — failing assertion gets lazy sample capped at sample-cap"
    (let [sample-cap @#'assertions/sample-cap
          n-rows     (+ sample-cap 10)
          ;; All rows have negative totals so the failing assertion matches more
          ;; rows than the sample cap.
          neg-csv    (str orders-csv-header "\n"
                          (str/join "\n" (for [i (range 1 (inc n-rows))]
                                           (str i ",1,1,-90,-10,-100,,2024-01-01T00:00:00Z,1")))
                          "\n")]
      (do-with-seeded-orders!
       neg-csv
       (fn [{:keys [db-id driver mapping output-sql backend]}]
         (let [results (assertions/run-assertions!
                        db-id driver backend mapping output-sql
                        ;; assertion 0: every row fails (total < 0) → over the sample cap
                        ;; assertion 1: no rows fail (id > 0 is always true) → pass
                        [{:name "total_positive" :sql "SELECT * FROM test_output WHERE total < 0" :severity :error}
                         {:name "id_positive"    :sql "SELECT * FROM test_output WHERE id <= 0"   :severity :error}])]
           (testing "returns two results"
             (is (= 2 (count results))))
           (testing "first assertion is :failed (all rows have negative totals)"
             (let [r (first results)]
               (is (= :failed (:status r)))
               (is (= n-rows (:failing_row_count r)))))
           (testing "sample_rows is capped at exactly sample-cap entries"
             (is (= sample-cap (count (:sample_rows (first results))))))
           (testing "second assertion is :passed (no rows with id <= 0)"
             (let [r (second results)]
               (is (= :passed (:status r)))
               (is (zero? (:failing_row_count r)))))
           (testing "sample_rows is nil for the passing assertion"
             (is (nil? (:sample_rows (second results)))))))))))

;;; ---------------------------------------------------------------------------
;;; warn-severity: full run, per-entry :warn, not :failed
;;; ---------------------------------------------------------------------------

(deftest run-assertions-warn-severity-test
  (testing ":warn severity firing → per-entry :warn, overall does not flip to :failed"
    (do-with-seeded-orders!
     two-positive-orders-csv
     (fn [{:keys [db-id driver mapping output-sql backend]}]
       (let [results (assertions/run-assertions!
                      db-id driver backend mapping output-sql
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
           (is (= :passed (assertions/overall-status :passed results)))))))))

;;; ---------------------------------------------------------------------------
;;; :batched → :per-assertion fallback on runtime warehouse error
;;; ---------------------------------------------------------------------------

(deftest run-assertions-batched-fallback-test
  (testing "runtime warehouse error in batched query → falls back to :per-assertion, still attributes results"
    ;; The bad assertion references a non-existent column: verify checks only table
    ;; refs, so it passes prepare, then fails at execution in the combined UNION ALL,
    ;; triggering the per-assertion fallback. The bad one gets an :error raw result;
    ;; the good one still executes and contributes a count.
    (do-with-seeded-orders!
     two-positive-orders-csv
     (fn [{:keys [db-id driver mapping output-sql backend]}]
       (let [per-assertion-calls (atom 0)
             run-one-orig        (mt/original-fn #'assertions/run-one-assertion!)
             bad-sql "SELECT * FROM test_output WHERE nonexistent_column_xyz < 0"
             results (mt/with-dynamic-fn-redefs
                       [assertions/run-one-assertion!
                        (fn [& args]
                          (swap! per-assertion-calls inc)
                          (apply run-one-orig args))]
                       (assertions/run-assertions!
                        db-id driver backend mapping output-sql
                        [{:name "bad_column_ref" :sql bad-sql                                   :severity :error}
                         {:name "good_assertion" :sql "SELECT * FROM test_output WHERE id <= 0" :severity :error}]))]
         (testing "returns two results (fallback attributed both)"
           (is (= 2 (count results))))
         (testing "the batched failure fell back to per-assertion execution"
           (is (= 2 @per-assertion-calls)
               "run-one-assertion! runs once per assertion only on the fallback path"))
         (testing "bad assertion is :failed with the QP error captured"
           (let [bad (first results)]
             (is (= "bad_column_ref" (:name bad)))
             ;; run-one-assertion! captures the QP error as a raw :error result;
             ;; interpret-one maps that to :failed + :error_message.
             (is (= :failed (:status bad)))
             (is (string? (:error_message bad)))))
         (testing "good assertion still gets a result"
           (let [good (second results)]
             (is (= "good_assertion" (:name good)))
             ;; id <= 0 is false for our data, so 0 failing rows → :passed
             (is (= :passed (:status good))))))))))

;;; ---------------------------------------------------------------------------
;;; fallback equivalence: the per-assertion fallback yields the batched verdicts
;;; ---------------------------------------------------------------------------

(deftest run-assertions-fallback-equivalence-test
  (testing "the per-assertion fallback path yields verdicts identical to the batched path"
    (let [mixed-csv      (str orders-csv-header "\n"
                              "1,1,1,90,10,100,,2024-01-01T00:00:00Z,1\n"
                              "2,2,2,45,5,-50,,2024-01-02T00:00:00Z,1\n"
                              "3,3,3,-10,-2,-12,,2024-01-03T00:00:00Z,1\n")
          assertion-defs [{:name "no_neg_total"    :sql "SELECT * FROM test_output WHERE total < 0"    :severity :error}
                          {:name "id_always_pos"   :sql "SELECT * FROM test_output WHERE id <= 0"      :severity :error}
                          {:name "subtotal_nonneg" :sql "SELECT * FROM test_output WHERE subtotal < 0" :severity :warn}]]
      (do-with-seeded-orders!
       mixed-csv
       (fn [{:keys [db-id driver mapping output-sql backend]}]
         (let [batched-results    (assertions/run-assertions!
                                   db-id driver backend mapping output-sql assertion-defs)
               ;; Drive the private fallback directly — it is otherwise reachable
               ;; only through a combined-query failure.
               prepared           (#'assertions/prepare driver backend mapping assertion-defs)
               per-assert-raw     (#'assertions/run-per-assertion! db-id output-sql prepared)
               per-assert-results (#'assertions/interpret prepared per-assert-raw)]
           (testing "both paths return same number of results"
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
                   (str "count mismatch for " (:name b)))))))))))
