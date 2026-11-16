(ns ^:mb/driver-tests metabase-enterprise.data-testing.write-runner-test
  "Runs of a subject that modifies existing tables instead of returning rows. Each test gives a card a write plan in
  place of its own, so the runner's write step is tested apart from any subject type."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt])
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
  "A [[data-testing.subject/subject-plan]] that runs `sql` with `params` on the test database."
  [sql params]
  {:database (data-testing.subject/testable-database (mt/id))
   :compiled {:query sql :params params}
   :writes?  true})

(defn- do-with-write-subject!
  "Call `f` with a card whose plan, for this test, is the write `sql` with `params`, and with a function returning the
  parameters each plan was asked for."
  [sql params f]
  (let [asked (atom [])]
    (mt/with-temp [:model/Card card {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                      (str "SELECT id FROM " (qualified :people)))}]
      (with-redefs [data-testing.subject/subject-plan (fn [_subject-type _subject definition]
                                                        (swap! asked conj (:parameters definition))
                                                        (write-plan sql params))]
        (f card #(deref asked))))))

(defn- run-write!
  "Run a saved test of the write `sql` with `params`, over `inputs`, checking `expectations`."
  [sql params inputs expectations]
  (do-with-write-subject!
   sql params
   (fn [card _asked]
     (mt/with-temp [:model/CardTest card-test {:card_id      (:id card)
                                               :inputs       inputs
                                               :expectations expectations}]
       (data-testing.runner/run-test! :card card card-test)))))

(defn- refusal!
  "The `:error-type` of the refusal of a test of the write `sql` with `params`, or nil when it is not refused."
  [sql params inputs expectations]
  (try
    (run-write! sql params inputs expectations)
    nil
    (catch ExceptionInfo e
      (:error-type (ex-data e)))))

(defn- refund-1
  "The write: person 1's `name` becomes `refunded`."
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
    (testing "the real table is not written"
      (is (= 0 (-> (mt/native-query {:query (str "SELECT count(*) FROM " (qualified :people) " WHERE name = 'refunded'")})
                   mt/process-query
                   mt/rows
                   ffirst
                   long))))))

(deftest write-to-an-undeclared-table-is-refused-test
  (mt/test-drivers (drivers-that-write)
    (testing "an INSERT whose target has no input is refused before any connection, naming the target"
      (let [sql (str "INSERT INTO " (qualified :orders) " (id) SELECT id FROM " (qualified :people) " WHERE id = ?")
            e   (try (run-write! sql [1] [(people-rows)] [(reading refunded-only-1)])
                     nil
                     (catch ExceptionInfo e e))]
        (is (= ::data-testing.errors/missing-inputs (:error-type (ex-data e))))
        (is (re-find (re-pattern (str "(?i)" (:name (table-ref :orders)))) (ex-message e)))))))

(deftest write-must-be-one-insert-update-or-delete-test
  (mt/test-drivers (drivers-that-write)
    (let [people (qualified :people)]
      (testing "control: one UPDATE runs"
        (is (nil? (refusal! (refund-1) ["refunded" 1] [(people-rows)] [(reading refunded-only-1)]))))
      (testing "a procedure call names no table, so the input check cannot see what it writes"
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
                               [{:type :equals :name "compares the output" :format :rows
                                 :columns [{:name "id" :cast_type (first (data-testing.test-util/cast-types))}]
                                 :rows    [{"id" 1}]}])
                   nil
                   (catch ExceptionInfo e e))]
        (is (= ::data-testing.errors/no-output (:error-type (ex-data e))))
        (is (re-find #"compares the output" (ex-message e)))))))

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
