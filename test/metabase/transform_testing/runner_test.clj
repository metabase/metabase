(ns ^:mb/driver-tests metabase.transform-testing.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.test :as mt]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.runner :as transform-testing.runner])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as the transform's compiled SQL will reference it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn- with-people-transform
  "Call `f` with the id of a transform selecting `id, name` from the people table, whose target is
  `people_summary` in the same schema."
  [f]
  (let [mp                            (mt/metadata-provider)
        {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
    (mt/with-temp [:model/Transform {transform-id :id}
                   {:source {:type  "query"
                             :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                    :target {:type     "table"
                             :schema   schema
                             :name     "people_summary"
                             :database (mt/id)}}]
      (f schema table transform-id))))

(defn- run-test!
  "Run a transform test over `transform-id` with one SQL input standing in for `schema`.`table`."
  [schema table transform-id input-sql expectations]
  (mt/with-temp [:model/TransformTest transform-test
                 {:transform_id transform-id
                  :inputs       [{:table  {:schema schema :name table}
                                  :format :sql
                                  :sql    input-sql}]
                  :expectations expectations}]
    (transform-testing.runner/run-transform-test! transform-test)))

(def ^:private one-row "SELECT 1 AS id, 'abc' AS name")

(def ^:private id+name
  ;; `database_type` is raw SQL, so these have to be spellings every tested engine accepts.
  [{:name "id" :database_type "INTEGER"}
   {:name "name" :database_type "VARCHAR"}])

(deftest run-transform-test-empty-expectation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (doseq [[desc where expected] [["passes when the query returns no rows"
                                        "name IS NULL"
                                        :passed]
                                       ["reads the input test data instead of the input table"
                                        "id <> 1"
                                        :passed]
                                       ["fails when the query returns rows"
                                        "name = 'abc'"
                                        :failed]]]
          (testing desc
            (let [result (run-test! schema table transform-id one-row
                                    [{:type :empty
                                      :name desc
                                      :sql  (str "SELECT * FROM " schema ".people_summary WHERE " where)}])]
              (is (= expected (:status result)))
              (is (= [{:name desc :type :empty :status expected}]
                     (mapv #(select-keys % [:name :type :status]) (:expectations result)))))))))))

(deftest run-transform-test-equals-passes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (testing "passes when the output matches the expected rows"
          (let [result (run-test! schema table transform-id one-row
                                  [{:type :equals :name "output" :format :rows
                                    :columns id+name
                                    :rows    [{"id" 1 "name" "abc"}]}])]
            (is (= :passed (:status result)))
            (is (= [:passed] (mapv :status (:expectations result))))))))))

(deftest run-transform-test-equals-cell-mismatch-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (testing "a single differing cell is reported by column name"
          (let [result   (run-test! schema table transform-id one-row
                                    [{:type :equals :name "output" :format :rows
                                      :columns id+name
                                      :rows    [{"id" 1 "name" "xyz"}]}])
                [expect] (:expectations result)]
            (is (= :failed (:status result)))
            (is (= :failed (:status expect)))
            (is (= {:actual 1 :expected 1} (:row-counts expect)))
            (is (= [{:column "name" :expected "xyz" :actual "abc"}]
                   (:cell-mismatches expect)))))))))

(deftest run-transform-test-equals-ignores-undeclared-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (testing "a column the expectation does not declare is not compared"
          (let [result (run-test! schema table transform-id one-row
                                  [{:type :equals :name "id only" :format :rows
                                    :columns [{:name "id" :database_type "INTEGER"}]
                                    :rows    [{"id" 1}]}])]
            (is (= :passed (:status result)))))))))

(deftest run-transform-test-equals-is-multiset-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (testing "a duplicated output row fails against a single expected row"
          ;; Set difference (a plain EXCEPT) passes here; multiset difference must not.
          (let [result   (run-test! schema table transform-id
                                    (str one-row " UNION ALL SELECT 1 AS id, 'abc' AS name")
                                    [{:type :equals :name "output" :format :rows
                                      :columns id+name
                                      :rows    [{"id" 1 "name" "abc"}]}])
                [expect] (:expectations result)]
            (is (= :failed (:status result)))
            (is (= {:actual 2 :expected 1} (:row-counts expect)))
            (is (= [{"id" 1 "name" "abc"}] (:extra-rows expect)))
            (is (= [] (:missing-rows expect)))))))))

(deftest run-transform-test-equals-matches-null-cells-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (with-people-transform
      (fn [schema table transform-id]
        (testing "a NULL cell in the output cancels against a nil in the expectation"
          ;; `GROUP BY` folds NULLs together. An equality-based difference leaves the row
          ;; uncancelled, reporting it as both missing and extra.
          (let [result (run-test! schema table transform-id
                                  "SELECT 1 AS id, CAST(NULL AS VARCHAR) AS name"
                                  [{:type :equals :name "output" :format :rows
                                    :columns id+name
                                    :rows    [{"id" 1 "name" nil}]}])]
            (is (= :passed (:status result)))))))))

(deftest run-transform-test-rejects-undeclared-input-test
  (testing "Guard A: a transform reading a table with no declared input is refused,"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      ;; the transform reads people, but the test declares no input for it — running would leave
      ;; people pointing at the real table (read production, false-green). Must reject before running.
      (let [mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                        :target {:type "table" :schema schema :name "people_summary" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       []
                        :expectations [{:type :empty :name "all" :sql (str "SELECT * FROM " schema ".people_summary")}]}]
          (let [ex (try (transform-testing.runner/run-transform-test! transform-test)
                        nil
                        (catch ExceptionInfo e e))]
            (testing "throws"
              (is (some? ex)))
            (testing "with a typed refusal that names the undeclared table"
              (is (= ::transform-testing.errors/missing-inputs (:error-type (ex-data ex))))
              (is (re-find (re-pattern (str "(?i)" table)) (ex-message ex))))))))))

(deftest run-transform-test-rejects-partially-declared-inputs-test
  (testing "Guard A: a join declaring only some of its input tables is rejected, naming the gap,"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      ;; reads orders and people; declares only orders → people would fall through to the real table.
      (let [mp     (mt/metadata-provider)
            people (:name (lib.metadata/table mp (mt/id :people)))
            orders (:name (lib.metadata/table mp (mt/id :orders)))
            {oschema :schema}            (table-ref :orders)]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query
                                         mp (str "SELECT o.id, p.name FROM " orders " o JOIN " people " p ON o.user_id = p.id"))}
                        :target {:type "table" :schema oschema :name "order_owners" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table (table-ref :orders) :format :sql
                                        :sql "SELECT 1 AS id, 1 AS user_id"}]
                        :expectations [{:type :empty :name "all" :sql (str "SELECT * FROM " oschema ".order_owners")}]}]
          (let [ex (try (transform-testing.runner/run-transform-test! transform-test)
                        nil
                        (catch ExceptionInfo e e))]
            (is (= ::transform-testing.errors/missing-inputs (:error-type (ex-data ex))))
            (testing "names the undeclared people, not the declared orders"
              (is (re-find (re-pattern (str "(?i)" people)) (ex-message ex)))
              (is (not (re-find (re-pattern (str "(?i)" orders)) (ex-message ex)))))))))))

(deftest run-transform-test-rejects-unused-input-test
  (testing "Guard A: a declared input for a table the transform does not read is refused,"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      ;; reads only people, but declares an input for orders too — a stale/mistyped fake.
      (let [mp                            (mt/metadata-provider)
            {schema :schema, people :name} (lib.metadata/table mp (mt/id :people))
            orders                        (:name (lib.metadata/table mp (mt/id :orders)))]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp (str "SELECT id, name FROM " schema "." people))}
                        :target {:type "table" :schema schema :name "people_summary" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table (table-ref :people) :format :sql
                                        :sql "SELECT 1 AS id, 'x' AS name"}
                                       {:table (table-ref :orders) :format :sql
                                        :sql "SELECT 1 AS id"}]
                        :expectations [{:type :empty :name "all" :sql (str "SELECT * FROM " schema ".people_summary")}]}]
          (let [ex (try (transform-testing.runner/run-transform-test! transform-test)
                        nil
                        (catch ExceptionInfo e e))]
            (is (= ::transform-testing.errors/unused-inputs (:error-type (ex-data ex))))
            (testing "names the unused orders, not the read people"
              (is (re-find (re-pattern (str "(?i)" orders)) (ex-message ex)))
              (is (not (re-find (re-pattern (str "(?i)" people)) (ex-message ex)))))))))))

(deftest run-transform-test-rejects-duplicate-input-table-test
  (testing "two inputs targeting the same table (even with different fixture SQL) are rejected 400,"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      ;; both inputs fixture `people`, differing only in SQL — they would collide on one temp table
      ;; and silently drop a fixture. Reject on :table, not on the whole (distinct) input map.
      (let [mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                        :target {:type "table" :schema schema :name "people_summary" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table (table-ref :people) :format :sql :sql "SELECT 1 AS id, 'a' AS name"}
                                       {:table (table-ref :people) :format :sql :sql "SELECT 2 AS id, 'b' AS name"}]
                        :expectations [{:type :empty :name "all" :sql (str "SELECT * FROM " schema ".people_summary")}]}]
          (let [ex (try (transform-testing.runner/run-transform-test! transform-test)
                        nil
                        (catch ExceptionInfo e e))]
            (is (= ::transform-testing.errors/duplicate-input-table (:error-type (ex-data ex))))
            (is (re-find #"(?i)duplicate" (ex-message ex)))))))))

(deftest run-transform-test-rejects-unparseable-source-test
  (testing "a SQLGlot parse failure cannot masquerade as a source with no table reads"
    (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Transform {transform-id :id}
                         {:source {:type "query"
                                   :query (lib/native-query mp "SELECT !!!")}
                          :target {:type "table" :schema "public" :name "parse_test" :database (mt/id)}}
                         :model/TransformTest transform-test
                         {:transform_id transform-id :inputs [] :expectations []}]
            (let [e (try (transform-testing.runner/run-transform-test! transform-test)
                         (catch ExceptionInfo e e))]
              (is (= ::transform-testing.errors/unparseable-source (:error-type (ex-data e))))
              (is (re-find #"could not be parsed" (ex-message e))))))))))

(deftest run-transform-test-table-qualified-columns-test
  (testing "column qualifiers naming a replaced table are rewritten along with the table, so the transform reads the input"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      (let [mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp (str "SELECT " table ".id, " table ".name FROM " table))}
                        :target {:type "table" :schema schema :name "people_qualified" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table (table-ref :people) :format :sql
                                        :sql "SELECT 1 AS id, 'x' AS name"}]
                        :expectations [{:type :empty :name "only the input row"
                                        :sql (str "SELECT * FROM " schema ".people_qualified WHERE id <> 1")}]}]
          (is (=? {:status :passed}
                  (transform-testing.runner/run-transform-test! transform-test))))))))
