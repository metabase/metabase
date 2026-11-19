(ns ^:mb/driver-tests metabase-enterprise.data-testing.write-runner-test
  "Runs of a subject that modifies existing tables instead of returning rows. Each test gives a card a write plan in
  place of its own, so the runner's write step is tested apart from any subject type."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.executor :as data-testing.executor]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as SQL names it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn- qualified
  "`schema.name` of the test-data table `table-key`, for SQL."
  [table-key]
  (let [{:keys [schema name]} (table-ref table-key)]
    (str schema "." name)))

(defn- drivers-that-write
  "The test drivers that run tests and actions, and whose SQL a write can be checked in. H2 has no such dialect."
  []
  (disj (mt/normal-drivers-with-feature :transforms/testing :actions) :h2))

(defn- people-rows
  "An input standing in for the people table with two people, 1 and 2, each named `paid`."
  []
  (let [[int-type text-type] (data-testing.test-util/cast-types)]
    {:table   (table-ref :people)
     :format  :rows
     :columns [{:name "id" :cast_type int-type} {:name "name" :cast_type text-type}]
     :rows    [{"id" 1 "name" "paid"} {"id" 2 "name" "paid"}]}))

(defn- write-plan
  "A `::data-testing.subject/subject-plan` that runs `sql` with `params` on the Database with `database-id`."
  [database-id sql params]
  {:database (data-testing.subject/testable-database database-id)
   :compiled {:query sql :params params}
   :writes?  true})

(defn- do-with-write-subject!
  "Call `f` with a card and a function returning the `:parameters` of each definition `subject-plan` was called with.
  While `f` runs, `subject-plan` returns the write `sql` with `params`, on the Database with `database-id` (by
  default the test database), for any subject."
  ([sql params f]
   (do-with-write-subject! (mt/id) sql params f))
  ([database-id sql params f]
   (let [asked (atom [])]
     (mt/with-temp [:model/Card card {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                       (str "SELECT id FROM " (qualified :people)))}]
       (with-redefs [data-testing.subject/subject-plan (fn [_subject-type _subject definition]
                                                         (swap! asked conj (:parameters definition))
                                                         (write-plan database-id sql params))]
         (f card #(deref asked)))))))

(defn- run-write!
  "Run a saved test of the write `sql` with `params`, over `inputs`, checking `expectations`, on the Database with
  `database-id` (by default the test database)."
  ([sql params inputs expectations]
   (run-write! (mt/id) sql params inputs expectations))
  ([database-id sql params inputs expectations]
   (do-with-write-subject!
    database-id sql params
    (fn [card _asked]
      (mt/with-temp [:model/CardTest card-test {:card_id      (:id card)
                                                :inputs       inputs
                                                :expectations expectations}]
        (data-testing.runner/run-test! :card card card-test))))))

(defn- refusal!
  "The `:error-type` of the refusal of a test of the write `sql` with `params`, or nil when it is not refused."
  [sql params inputs expectations]
  (:error-type (data-testing.test-util/refusal #(run-write! sql params inputs expectations))))

(defn- refund-1
  "The UPDATE of the people table that sets `name` to the first parameter where `id` is the second. Every test passes
  `[\"refunded\" 1]`."
  []
  (str "UPDATE " (qualified :people) " SET name = ? WHERE id = ?"))

(def ^:private refunded-only-1
  "An expectation that reads the people table after the write: 1 is `refunded`, 2 is `paid`, and there are no others."
  {:type :empty
   :name "only person 1 is refunded"
   :sql  "SELECT * FROM %s WHERE (id = 1 AND name <> 'refunded') OR (id = 2 AND name <> 'paid') OR id NOT IN (1, 2)"})

(defn- reading
  "`expectation` with its SQL reading the people table."
  [expectation]
  (update expectation :sql format (qualified :people)))

(deftest write-runs-on-the-inputs-test
  (mt/test-drivers (drivers-that-write)
    (testing "the write changes the input's rows, and the expectations read them after it"
      (is (=? {:status       :passed
               :expectations [{:name "only person 1 is refunded" :status :passed}]}
              (run-write! (refund-1) ["refunded" 1] [(people-rows)] [(reading refunded-only-1)]))))
    (testing "an expectation that reads the rows as they were before the write fails"
      (is (=? {:status       :failed
               :expectations [{:name "person 1 is paid" :status :failed}]}
              (run-write! (refund-1) ["refunded" 1] [(people-rows)]
                          [(reading {:type :empty :name "person 1 is paid" :sql "SELECT * FROM %s WHERE name <> 'paid'"})]))))
    (testing "the run reports the temp table of each input and no output table"
      (is (= [(qualified :people)]
             (vals (:tables (run-write! (refund-1) ["refunded" 1] [(people-rows)] [(reading refunded-only-1)]))))))
    (testing "the write statement names the input's temp table, not the real table"
      (let [executed (atom [])
            execute! (mt/original-fn #'data-testing.executor/execute!)]
        (mt/with-dynamic-fn-redefs [data-testing.executor/execute! (fn [driver conn query]
                                                                     (swap! executed conj (:query query))
                                                                     (execute! driver conn query))]
          (let [[temp-table] (keys (:tables (run-write! (refund-1) ["refunded" 1] [(people-rows)]
                                                        [(reading refunded-only-1)])))
                [statement :as statements] @executed]
            (is (= 1 (count statements)))
            (is (str/includes? statement temp-table))
            (is (not (str/includes? (u/lower-case-en statement) (u/lower-case-en (qualified :people)))))))))))

(deftest write-to-an-undeclared-table-is-refused-test
  (mt/test-drivers (drivers-that-write)
    (testing "an INSERT whose target has no input is refused, naming the target"
      (let [sql (str "INSERT INTO " (qualified :orders) " (id) SELECT id FROM " (qualified :people) " WHERE id = ?")
            e   (try (run-write! sql [1] [(people-rows)] [(reading refunded-only-1)])
                     nil
                     (catch ExceptionInfo e e))]
        (is (= ::data-testing.errors/missing-inputs (:error-type (ex-data e))))
        (is (re-find (re-pattern (str "(?i)" (:name (table-ref :orders)))) (ex-message e)))))))

(deftest write-to-a-table-named-like-a-cte-is-refused-test
  (mt/test-drivers (drivers-that-write)
    (let [orders (:name (table-ref :orders))
          cte    (str "WITH " orders " AS (SELECT id FROM " (qualified :people) ") ")
          refuse (fn [sql params]
                   (refusal! (str cte sql) params [(people-rows)] [(reading refunded-only-1)]))]
      (testing "control: an UPDATE of the bare name with no CTE and no input is refused as a missing input"
        (is (= ::data-testing.errors/missing-inputs
               (refusal! (str "UPDATE " orders " SET quantity = quantity WHERE id = ?") [1]
                         [(people-rows)] [(reading refunded-only-1)]))))
      (testing "the target of an UPDATE is the table, not the CTE of its name, so it is refused as a missing input"
        (is (= ::data-testing.errors/missing-inputs
               (refuse (str "UPDATE " orders " SET quantity = quantity WHERE id = ?") [1]))))
      (testing "the target of an INSERT, likewise"
        (is (= ::data-testing.errors/missing-inputs
               (refuse (str "INSERT INTO " orders " (id) SELECT id FROM " orders " WHERE id = ?") [-1]))))
      (testing "the target of a DELETE, likewise"
        (is (= ::data-testing.errors/missing-inputs
               (refuse (str "DELETE FROM " orders " WHERE id = ?") [-1])))))))

(deftest write-to-a-table-named-like-a-cte-runs-on-its-input-test
  (mt/test-drivers (drivers-that-write)
    (let [people (:name (table-ref :people))]
      (testing "the target of an UPDATE named like a CTE is rewritten to its input's temp table, which the write changes"
        (is (=? {:status       :passed
                 :expectations [{:name "only person 1 is refunded" :status :passed}]}
                (run-write! (str "WITH " people " AS (SELECT 1 AS id) UPDATE " people " SET name = ? WHERE id = ?")
                            ["refunded" 1] [(people-rows)] [(reading refunded-only-1)])))))))

(deftest write-must-be-one-insert-update-or-delete-test
  (mt/test-drivers (drivers-that-write)
    (let [people (qualified :people)]
      (testing "control: one UPDATE runs"
        (is (nil? (refusal! (refund-1) ["refunded" 1] [(people-rows)] [(reading refunded-only-1)]))))
      (testing "a procedure call is refused: it names no table, so the input check cannot see what it writes"
        (is (= ::data-testing.errors/not-a-single-write
               (refusal! "CALL refund_order(?)" [1] [(people-rows)] [(reading refunded-only-1)]))))
      (testing "a second statement is refused, even when it writes a declared table"
        (is (= ::data-testing.errors/not-a-single-write
               (refusal! (str (refund-1) "; DELETE FROM " people) ["refunded" 1] [(people-rows)]
                         [(reading refunded-only-1)]))))
      (testing "a SELECT is not a write"
        (is (= ::data-testing.errors/not-a-single-write
               (refusal! (str "SELECT * FROM " people " WHERE id = ?") [1] [(people-rows)]
                         [(reading refunded-only-1)])))))))

(deftest write-on-a-database-whose-sql-cannot-be-checked-is-refused-test
  (mt/test-driver :h2
    (testing "H2 has no SQL dialect to check a write in, so a subject that modifies tables is refused on H2"
      (is (= ::data-testing.errors/uncheckable-write
             (refusal! (refund-1) ["refunded" 1] [(people-rows)] [(reading refunded-only-1)]))))))

(deftest equals-on-a-write-is-refused-test
  (mt/test-drivers (drivers-that-write)
    (testing "`equals` compares an output, and a write has none"
      (let [e (try (run-write! (refund-1) ["refunded" 1] [(people-rows)]
                               [{:type :equals :name "person 1 only" :format :rows
                                 :columns [{:name "id" :cast_type (first (data-testing.test-util/cast-types))}]
                                 :rows    [{"id" 1}]}])
                   nil
                   (catch ExceptionInfo e e))]
        (is (= ::data-testing.errors/no-output (:error-type (ex-data e))))
        (is (re-find #"\"person 1 only\"" (ex-message e)))
        (is (re-find #"has no output" (ex-message e)))))))

(defn- validation-refusal!
  "The `:error-type` and message of the refusal [[data-testing.runner/validate-test]] throws for a test of the write
  `sql` with `params`, or nil when it throws none."
  [sql params]
  (do-with-write-subject!
   sql params
   (fn [card _asked]
     (data-testing.test-util/refusal
      #(data-testing.runner/validate-test :card card {:inputs       [(people-rows)]
                                                      :expectations [(reading refunded-only-1)]})))))

(deftest write-returning-rows-is-refused-test
  (mt/test-drivers (drivers-that-write)
    (let [returning (str (refund-1) " RETURNING id")]
      (testing "control: an UPDATE that returns no rows is not refused"
        (is (nil? (validation-refusal! (refund-1) ["refunded" 1]))))
      (testing "an UPDATE with RETURNING is refused when the test is saved, as a 400 that names RETURNING"
        (let [{:keys [error-type message]} (validation-refusal! returning ["refunded" 1])]
          (is (= ::data-testing.errors/write-returns-rows error-type))
          (is (= 400 (data-testing.errors/status-code error-type)))
          (is (re-find #"RETURNING" (str message)))))
      (testing "and when it is run, before any temp table is created"
        (let [created? (atom false)]
          (mt/with-dynamic-fn-redefs [data-testing.executor/create-temp-table! (fn [& _] (reset! created? true))]
            (is (= ::data-testing.errors/write-returns-rows
                   (refusal! returning ["refunded" 1] [(people-rows)] [(reading refunded-only-1)])))
            (is (false? @created?))))))))

(deftest parameters-reach-the-subject-plan-test
  (mt/test-drivers (drivers-that-write)
    (do-with-write-subject!
     (refund-1) ["refunded" 1]
     (fn [card asked]
       (testing "validating a test asks the subject for its plan with the test's parameter values"
         (is (nil? (data-testing.runner/validate-test
                    :card card
                    {:inputs       [(people-rows)]
                     :expectations [(reading refunded-only-1)]
                     :parameters   {"id" 1 "status" "refunded"}})))
         (is (= [{"id" 1 "status" "refunded"}] (asked))))))))

(defn- fail-to-write!
  "Run a saved test of a write that the warehouse rejects: it reads a column of the people table, qualified by the
  table's name, that the table does not have. Postgres and MySQL both name the table in the error."
  []
  (let [people (qualified :people)]
    (run-write! (str "UPDATE " people " SET name = ? WHERE " people ".no_such_column = ?") ["x" 1]
                [(people-rows)] [(reading refunded-only-1)])))

(deftest failed-write-is-refused-naming-the-input-test
  (mt/test-drivers (drivers-that-write)
    (testing "a write the warehouse rejects is refused as a failed query, naming the input, not its temp table"
      (let [created     (atom [])
            orig-create (mt/original-fn #'data-testing.executor/create-temp-table!)
            {:keys [error-type message]}
            (mt/with-dynamic-fn-redefs [data-testing.executor/create-temp-table! (fn [driver conn table query]
                                                                                   (swap! created conj table)
                                                                                   (orig-create driver conn table query))]
              (data-testing.test-util/refusal fail-to-write!))
            [temp-table] @created]
        (is (= ::data-testing.errors/query-failed error-type))
        (is (str/includes? (str message) (qualified :people)))
        (is (string? temp-table))
        (is (not (str/includes? (u/lower-case-en (str message)) (u/lower-case-en temp-table))))))))

(deftest temp-tables-are-dropped-after-a-failed-write-test
  (mt/test-drivers (drivers-that-write)
    (let [created     (atom [])
          dropped     (atom [])
          orig-create (mt/original-fn #'data-testing.executor/create-temp-table!)
          orig-drop   (mt/original-fn #'data-testing.executor/drop-temp-table!)]
      (mt/with-dynamic-fn-redefs [data-testing.executor/create-temp-table! (fn [driver conn table query]
                                                                             (swap! created conj table)
                                                                             (orig-create driver conn table query))
                                  data-testing.executor/drop-temp-table!   (fn [driver conn table]
                                                                             (swap! dropped conj table)
                                                                             (orig-drop driver conn table))]
        (testing "premise: the write is refused as a failed query"
          (is (= ::data-testing.errors/query-failed
                 (:error-type (data-testing.test-util/refusal fail-to-write!)))))
        (testing "the run drops the temp table of its one input, and nothing else"
          (is (= 1 (count @created)))
          (is (= (set @created) (set @dropped))))))))

(defn- string-setting
  "`standard_conforming_strings` as a query on the Database with `database-id` sees it, outside any test run."
  [database-id]
  (ffirst (mt/rows (qp/process-query {:database database-id
                                      :type     :native
                                      :native   {:query "SHOW standard_conforming_strings"}}))))

(deftest write-runs-with-standard-conforming-strings-on-test
  (mt/test-driver :postgres
    (testing "on a database whose connections turn standard_conforming_strings off"
      (mt/with-temp [:model/Database {db-id :id} {:engine  :postgres
                                                  :details (assoc (:details (mt/db))
                                                                  :additional-options
                                                                  "options=-c%20standard_conforming_strings%3Doff")}]
        (testing "premise: a query on the database sees the setting off"
          (is (= "off" (string-setting db-id))))
        (testing "a run turns the setting on: the write records it, and the expectation reads it"
          (is (=? {:status       :passed
                   :expectations [{:name "the write saw the setting on" :status :passed}]}
                  (run-write! db-id
                              (str "UPDATE " (qualified :people)
                                   " SET name = current_setting('standard_conforming_strings') WHERE id = ?")
                              [1]
                              [(people-rows)]
                              [(reading {:type :empty
                                         :name "the write saw the setting on"
                                         :sql  "SELECT * FROM %s WHERE id = 1 AND name <> 'on'"})]))))
        (testing "a run leaves the setting as it found it"
          (is (= "off" (string-setting db-id))))))))

(defn- write-name-1!
  "Run a saved test of the UPDATE of the people table that sets person 1's name to the Postgres expression `value`,
  with an expectation that the name is the Postgres expression `expected`."
  [value expected]
  (run-write! (str "UPDATE " (qualified :people) " SET name = " value " WHERE id = ?") [1] [(people-rows)]
              [(reading {:type :empty
                         :name "person 1 has the name"
                         :sql  (str "SELECT * FROM %s WHERE id = 1 AND name <> " expected)})]))

(deftest write-with-a-backslash-in-an-e-string-test
  (mt/test-driver :postgres
    (testing "a write whose E'' string ends in a doubled backslash runs, and stores one backslash"
      (is (=? {:status       :passed
               :expectations [{:name "person 1 has the name" :status :passed}]}
              (write-name-1! "E'a\\\\'" "'a' || chr(92)"))))
    (testing "a doubled backslash before a letter stores a backslash and the letter, not a control character"
      (is (=? {:status       :passed
               :expectations [{:name "person 1 has the name" :status :passed}]}
              (write-name-1! "E'a\\\\nb'" "'a' || chr(92) || 'nb'"))))))
