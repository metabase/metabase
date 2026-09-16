(ns metabase-enterprise.dependencies.db-test
  "The dependencies module's app-db queries bind their values as parameters, so a value that looks like SQL is
  matched as text rather than compiled into the statement."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as deps.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;; Ids far above anything the shared dev/test app db holds, so these rows are this namespace's alone.
(def ^:private from-id 987654)
(def ^:private to-id 987655)

(deftest entity-type-is-bound-as-a-value-test
  (testing "an entity type that looks like SQL matches nothing rather than changing the query"
    (mt/with-temp [:model/Dependency _ {:from_entity_type :card :from_entity_id from-id
                                        :to_entity_type :table :to_entity_id to-id}]
      (let [injection "card' OR '1'='1"]
        (is (empty? (deps.db/dependencies-from injection from-id)))
        (is (false? (deps.db/dependency-exists? injection from-id "table" to-id)))
        (is (nil? (deps.db/dependency-status injection from-id)))
        (is (nil? (deps.db/finding-id injection from-id)))
        (is (empty? (deps.db/finding-errors-for-entity injection from-id)))
        (testing "and the real row is still found"
          (is (seq (deps.db/dependencies-from "card" from-id)))
          (is (true? (deps.db/dependency-exists? "card" from-id "table" to-id))))))))

(deftest entity-type-accepts-a-keyword-test
  (testing "a query map bypasses Toucan's keyword transform, so the entity type is normalised to its name"
    (mt/with-temp [:model/Dependency _ {:from_entity_type :card :from_entity_id from-id
                                        :to_entity_type :table :to_entity_id to-id}]
      (testing "the keyword and the string select the same rows"
        (is (= (map :id (deps.db/dependencies-from "card" from-id))
               (map :id (deps.db/dependencies-from :card from-id)))))
      (is (true? (deps.db/dependency-exists? :card from-id :table to-id))))))

(deftest ids-are-coerced-test
  (testing "an id slot rejects a string rather than reaching SQL"
    (is (thrown? Exception (deps.db/card "1 OR 1=1")))
    (is (thrown? Exception (deps.db/transform-ids-of-source-database "1 OR 1=1")))))

(deftest table-id-by-name-nil-schema-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {table-id :id} {:db_id db-id :schema nil :name "PEOPLE"}]
    (testing "a nil schema matches IS NULL rather than comparing against a bound NULL"
      (is (= table-id (deps.db/table-id-by-name db-id nil "PEOPLE"))))
    (testing "a table name that looks like SQL matches nothing"
      (is (nil? (deps.db/table-id-by-name db-id nil "PEOPLE' OR 1=1 --"))))
    (testing "a schema that looks like SQL matches nothing"
      (is (nil? (deps.db/table-id-by-name db-id "public' OR 1=1 --" "PEOPLE"))))))

(deftest table-id-by-name-with-schema-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "ORDERS"}]
    (testing "a real schema is bound as a parameter and still matches"
      (is (= table-id (deps.db/table-id-by-name db-id "public" "ORDERS"))))
    (testing "a nil schema does not match a row that has one"
      (is (nil? (deps.db/table-id-by-name db-id nil "ORDERS"))))))
