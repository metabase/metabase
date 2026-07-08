(ns ^:synchronous metabase-enterprise.serialization.metadata-file-import.processors-test
  "Tests for the pure batch processors. Each processor is exercised against an
  appdb populated via `mt/with-temp` — no HTTP, no streaming parser. Tests
  verify the processor's behavior contract: input shape, return shape, batch
  ordering, error attribution, and observable side-effects on the appdb."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

;;; ============================== with-staging-tables ==============================

(defn- count-staging
  "Total row count across both staging tables."
  []
  (+ (t2/count :metabase_table_import)
     (t2/count :metabase_field_import)))

(deftest clear-staging-tables-empties-both-tables-test
  (testing "clear-staging-tables! deletes every row from both staging tables"
    (t2/insert! :metabase_table_import {:source_id 1 :source_db_id 1 :db_name "x" :name "t"})
    (t2/insert! :metabase_field_import {:source_id 1 :source_table_id 1
                                        :name "f" :base_type "type/Integer" :database_type "int"})
    (processors/clear-staging-tables!)
    (is (zero? (count-staging))
        "both staging tables empty after clear-staging-tables!")))

(deftest with-staging-tables-returns-body-value-test
  (testing "with-staging-tables yields the value of the body's last form"
    (is (= ::sentinel
           (processors/with-staging-tables ::sentinel)))))

(deftest with-staging-tables-clears-on-entry-test
  (testing "rows present before the macro are gone by the time the body runs"
    (t2/insert! :metabase_table_import {:source_id 1 :source_db_id 1 :db_name "leftover" :name "t"})
    (t2/insert! :metabase_field_import {:source_id 1 :source_table_id 1
                                        :name "f" :base_type "type/Integer" :database_type "int"})
    (let [observed (processors/with-staging-tables (count-staging))]
      (is (zero? observed)
          "macro entry wipes pre-existing rows so the body sees an empty staging area"))))

(deftest with-staging-tables-clears-on-successful-exit-test
  (testing "rows inserted inside the body are gone after the macro returns normally"
    (processors/with-staging-tables
      (t2/insert! :metabase_table_import {:source_id 1 :source_db_id 1 :db_name "x" :name "t"})
      (t2/insert! :metabase_field_import {:source_id 1 :source_table_id 1
                                          :name "f" :base_type "type/Integer" :database_type "int"}))
    (is (zero? (count-staging))
        "macro exit wipes rows the body added")))

(deftest with-staging-tables-clears-on-thrown-exit-and-propagates-test
  (testing "if the body throws, the exception bubbles AND staging tables are still wiped (try/finally)"
    (let [thrown (atom nil)]
      (try
        (processors/with-staging-tables
          (t2/insert! :metabase_table_import {:source_id 1 :source_db_id 1 :db_name "x" :name "t"})
          (t2/insert! :metabase_field_import {:source_id 1 :source_table_id 1
                                              :name "f" :base_type "type/Integer" :database_type "int"})
          (throw (ex-info "boom" {:kind ::test-error})))
        (catch clojure.lang.ExceptionInfo e
          (reset! thrown e)))
      (is (= ::test-error (:kind (ex-data @thrown)))
          "exception propagates with its ex-data intact")
      (is (zero? (count-staging))
          "staging tables wiped even though body threw"))))

;;; ============================== process-databases ==============================

(deftest process-databases-matches-by-name-and-engine-test
  (testing "a source row whose (name, engine) pair matches an existing target Database
            produces a :matched result whose :target-id is the existing row's id.
            :source-id carries the wire :id (source appdb's integer database id);
            :name is also surfaced for the orchestrator's db_name denormalization map."
    (mt/with-temp [:model/Database {target-id :id} {:name "imported-db" :engine :postgres}]
      (is (= [{:source-id 100 :name "imported-db" :target-id target-id :status :matched}]
             (into [] (processors/process-databases!
                       [[1 {:id 100 :name "imported-db" :engine "postgres"}]])))))))

(deftest process-databases-emits-no-match-when-name-or-engine-differs-test
  (testing "an unmatched row emits a :no-match result with line attribution and a
            human-readable detail string. Mismatches are non-fatal — the loader logs and
            skips dependents rather than aborting boot."
    (let [[result] (into [] (processors/process-databases!
                             [[7 {:id 200 :name "no-such-db-zzz" :engine "h2"}]]))]
      (is (= 200 (:source-id result)))
      (is (= "no-such-db-zzz" (:name result)))
      (is (= :no-match (:status result)))
      (is (= 7 (:line result)))
      (is (string? (:detail result)))
      (is (not (contains? result :target-id))
          "no :target-id key on no-match (so callers can use (:target-id r) as a presence check)"))))

(deftest process-databases-disambiguates-by-engine-pair-test
  (testing "two databases share a name but differ by engine; matching uses the
            (name, engine) pair, not just name"
    (mt/with-temp [:model/Database {pg-id :id} {:name "shared-name-test" :engine :postgres}
                   :model/Database {h2-id :id} {:name "shared-name-test" :engine :h2}]
      (let [[r] (into [] (processors/process-databases!
                          [[1 {:id 300 :name "shared-name-test" :engine "h2"}]]))]
        (is (= h2-id (:target-id r)))
        (is (not= pg-id (:target-id r)))))))

(deftest process-databases-validation-failure-throws-with-attribution-test
  (testing "a malformed row (missing required key) throws ex-info carrying
            :kind :invalid-input, the file line number, and the row's wire :id
            as the :source-id (for attribution in the boot-time error message)."
    (let [e    (is (thrown? clojure.lang.ExceptionInfo
                            (into [] (processors/process-databases!
                                      [[42 {:id 400 :name "missing-engine"}]]))))   ;; no :engine
          data (ex-data e)]
      (is (= :invalid-input (:kind data)))
      (is (= 42 (:line data)))
      (is (= 400 (:source-id data))))))

(deftest process-databases-preserves-input-order-test
  (testing "results are in input order regardless of internal SELECT ordering or
            which entries match"
    (mt/with-temp [:model/Database {a-id :id} {:name "order-a" :engine :postgres}
                   :model/Database {b-id :id} {:name "order-b" :engine :postgres}]
      (let [results (into [] (processors/process-databases!
                              [[1 {:id 501 :name "order-b"        :engine "postgres"}]
                               [2 {:id 502 :name "no-such-name-q" :engine "h2"}]
                               [3 {:id 503 :name "order-a"        :engine "postgres"}]]))]
        (is (= [501 502 503]                          (mapv :source-id results)))
        (is (= ["order-b" "no-such-name-q" "order-a"] (mapv :name results)))
        (is (= [b-id nil a-id]                        (mapv :target-id results)))
        (is (= [:matched :no-match :matched]          (mapv :status results)))))))

(deftest process-databases-empty-batch-test
  (testing "empty input → empty output, no SQL, no exception"
    (is (= [] (into [] (processors/process-databases! []))))))

(deftest process-databases-result-is-streamable-test
  (testing "the return value supports both `reduce` (the loader's fold path) and
            seq/iteration (the test path) without re-running the eager batch work"
    (mt/with-temp [:model/Database {target-id :id} {:name "stream-probe" :engine :postgres}]
      (let [result     (processors/process-databases!
                        [[1 {:id 700 :name "stream-probe" :engine "postgres"}]])
            via-reduce (reduce (fn [acc r] (assoc acc (:source-id r) (:target-id r))) {} result)
            via-seq    (vec (seq result))]
        (is (= {700 target-id} via-reduce))
        (is (= 1 (count via-seq)))))))
