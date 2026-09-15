(ns ^:mb/driver-tests metabase.transform-testing.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.test :as mt]
   [metabase.transform-testing.runner :as transform-testing.runner])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as the transform's compiled SQL will reference it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(deftest run-transform-test-empty-expectation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [mp                            (mt/metadata-provider)
          {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:source {:type  "query"
                               :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                      :target {:type     "table"
                               :schema   schema
                               :name     "people_summary"
                               :database (mt/id)}}]
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
            (mt/with-temp [:model/TransformTest transform-test
                           {:transform_id transform-id
                            :inputs       [{:table  {:schema schema :name table}
                                            :format :sql
                                            :sql    "SELECT 1 AS id, 'abc' AS name"}]
                            :expectations [{:type :empty
                                            :name desc
                                            :sql  (str "SELECT * FROM " schema ".people_summary WHERE " where)}]}]
              (is (= {:status expected}
                     (transform-testing.runner/run-transform-test! transform-test))))))))))

(deftest run-transform-test-rejects-undeclared-input-test
  (testing "Guard A: a transform reading a table with no declared input is rejected with a 400,"
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
            (testing "with a 400 status and names the undeclared table"
              (is (= 400 (:status-code (ex-data ex))))
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
            (is (= 400 (:status-code (ex-data ex))))
            (testing "names the undeclared people, not the declared orders"
              (is (re-find (re-pattern (str "(?i)" people)) (ex-message ex)))
              (is (not (re-find (re-pattern (str "(?i)" orders)) (ex-message ex)))))))))))

(deftest run-transform-test-rejects-unused-input-test
  (testing "Guard A: a declared input for a table the transform does not read is rejected 400,"
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
            (is (= 400 (:status-code (ex-data ex))))
            (testing "names the unused orders, not the read people"
              (is (re-find (re-pattern (str "(?i)" orders)) (ex-message ex)))
              (is (not (re-find (re-pattern (str "(?i)" people)) (ex-message ex)))))))))))

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
              (is (= 400 (:status-code (ex-data e))))
              (is (re-find #"could not be parsed" (ex-message e))))))))))

(deftest run-transform-test-dangling-column-qualifier-test
  (testing "a source-table column qualifier that survives the rewrite currently fails at execution."
    ;; `SELECT people.id FROM people` rewrites the FROM to the temp table but leaves the `people.id`
    ;; qualifier dangling, so the CTAS errors. This documents TODAY's behavior; Guard B (GHY-4559)
    ;; will turn this into a clean 400 telling the author to qualify by alias — update this test then.
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
                        :expectations [{:type :empty :name "all" :sql (str "SELECT * FROM " schema ".people_qualified")}]}]
          (is (thrown? Exception
                       (transform-testing.runner/run-transform-test! transform-test))))))))
