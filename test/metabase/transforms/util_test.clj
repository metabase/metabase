(ns ^:mb/driver-tests metabase.transforms.util-test
  "Tests for transform utility functions."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms.util :as transforms.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest temp-table-name-test
  (testing "temp-table-name generates valid table names respecting driver limits"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*]

        (testing "Basic table name generation"
          (let [result (driver.u/temp-table-name driver nil)
                table-name (name result)]
            (is (keyword? result))
            (is (nil? (namespace result)))
            (is (re-matches #"mb_transform_temp_table_[a-f0-9]{8}" table-name))))

        (testing "Table name preserves namespace when present"
          (let [result (driver.u/temp-table-name driver :schema/orders)]
            (is (= "schema" (namespace result)))
            (is (re-matches #"mb_transform_temp_table_[a-f0-9]{8}" (name result)))))))))

(deftest temp-table-name-creates-table-test
  (testing "temp-table-name produces names that can actually create tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (let [driver driver/*driver*
            db-id (mt/id)

            table-name (driver.u/temp-table-name driver :test_table)
            schema-name (when (get-method sql.tx/session-schema driver)
                          (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name (name table-name))
                                   table-name)
            column-definitions {"id" (driver/type->database-type driver :type/Integer)}]
        (mt/as-admin
          (try
            (testing "Can create table with generated temp name"
              (driver/create-table! driver db-id qualified-table-name column-definitions {})
              (when-not (= driver :mongo) ;; mongo doesn't actually create tables
                (is (driver/table-exists? driver (mt/db) {:schema schema-name :name (name table-name)}))))
            (finally
              (try
                (driver/drop-table! driver db-id qualified-table-name)
                (catch Exception _e
                  ;; Ignore cleanup errors
                  nil)))))))))

(deftest is-temp-transform-tables-test
  (mt/with-premium-features #{}
    (testing "tables with schema"
      (let [table-with-schema    {:name (name (driver.u/temp-table-name :postgres :schema/orders))}
            table-without-schema {:name (name (driver.u/temp-table-name :postgres :orders))}]
        (is (true? (transforms.util/is-temp-transform-table? table-with-schema)))
        (is (true? (transforms.util/is-temp-transform-table? table-without-schema)))))))

(deftest create-table-from-schema!-test
  (testing "create-table-from-schema! preserves column order from schema definition"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*
            db-id (mt/id)
            schema-name (when (get-method sql.tx/session-schema driver)
                          (sql.tx/session-schema driver))
            table-name (keyword "test_column_order")
            qualified-table-name (if schema-name
                                   (keyword schema-name (name table-name))
                                   table-name)
            table-schema {:name qualified-table-name
                          :columns [{:name "zebra_col" :type :type/Text}
                                    {:name "apple_col" :type :type/Integer}
                                    {:name "mango_col" :type :type/Boolean}]}]
        (mt/as-admin
          (try
            (testing "Creating table with ordered columns"
              (transforms.util/create-table-from-schema! driver db-id table-schema)
              (is (driver/table-exists? driver (mt/db) {:schema schema-name :name (name table-name)})))

            (when (get-method driver/describe-table driver)
              (testing "Column order matches schema definition order (not alphabetical)"
                (let [table-metadata {:schema schema-name :name (name table-name)}
                      described-fields (:fields (driver/describe-table driver (mt/db) table-metadata))
                      sorted-fields (sort-by :database-position described-fields)
                      column-names (mapv :name sorted-fields)
                      expected-names ["zebra_col" "apple_col" "mango_col"]]
                  (is (= expected-names column-names)
                      (str "Expected column order " expected-names
                           " but got " column-names)))))

            (finally
              (try
                (driver/drop-table! driver db-id qualified-table-name)
                (catch Exception _e
                  ;; Ignore cleanup errors
                  nil)))))))))

;;; ------------------------------------------------------------
;;; Filter xf tests
;;; ------------------------------------------------------------

(deftest ^:parallel matching-timestamp?-test
  (testing "matching-timestamp? checks if a timestamp falls within a date range [start, end)"
    (let [matching-timestamp? #'transforms.util/matching-timestamp?
          field-path          [:start_time]
          range-jan-feb       {:start "2024-01-01T00:00:00Z" :end "2024-02-01T00:00:00Z"}
          range-start-only    {:start "2024-01-01T00:00:00Z" :end nil}
          range-end-only      {:start nil :end "2024-02-01T00:00:00Z"}]

      (testing "with both start and end bounds"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-jan-feb))
          nil   nil                       ; missing field returns nil
          true  "2024-01-15T12:00:00Z"    ; timestamp in middle of range
          false "2023-12-15T12:00:00Z"    ; timestamp before range
          false "2024-02-15T12:00:00Z"    ; timestamp after range
          true  "2024-01-01T00:00:00Z"    ; start boundary is inclusive
          true  "2024-02-01T00:00:00Z"))  ; end boundary is inclusive too 🤷

      (testing "with only start bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-start-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp after start
          true  "2024-02-15T12:00:00Z"    ; any timestamp after start
          false "2023-12-15T12:00:00Z"))  ; timestamp before start

      (testing "with only end bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-end-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp before end
          true  "2023-12-15T12:00:00Z"    ; any timestamp before end
          false "2024-02-15T12:00:00Z"))  ; timestamp after end

      (testing "returns nil when field value is missing"
        (are [job] (nil? (matching-timestamp? job field-path range-jan-feb))
          {}
          {:other "value"})))))

;;; ------------------------------------------------- Source Table Resolution Tests ----------------------------------

(deftest batch-lookup-table-ids-test
  (testing "batch-lookup-table-ids looks up table IDs from ref maps"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "table_one" :schema nil}
                   :model/Table    t2 {:db_id (:id db) :name "table_two" :schema "my_schema"}]
      (testing "returns nil for empty input"
        (is (nil? (transforms.util/batch-lookup-table-ids [])))
        (is (nil? (transforms.util/batch-lookup-table-ids nil))))

      (testing "looks up table without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)} result))))

      (testing "looks up table with schema"
        (let [refs [{:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) "my_schema" "table_two"] (:id t2)} result))))

      (testing "handles mixed refs with and without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}
                    {:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)
                  [(:id db) "my_schema" "table_two"] (:id t2)}
                 result))))

      (testing "returns empty for non-existent table"
        (let [refs [{:database_id (:id db) :schema nil :table "nonexistent"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {} result)))))))

(deftest normalize-source-tables-test
  (testing "normalize-source-tables converts all entries to map format"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "existing_table" :schema nil}]
      (testing "converts integer table ID to map format"
        (let [result (transforms.util/normalize-source-tables {"t" (:id t1)})]
          (is (map? (get result "t")))
          (is (= (:id db) (get-in result ["t" :database_id])))
          (is (= "existing_table" (get-in result ["t" :table])))
          (is (= (:id t1) (get-in result ["t" :table_id])))))

      (testing "throws for non-existent integer table ID"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found for ids: 999999"
                              (transforms.util/normalize-source-tables {"t" 999999}))))

      (testing "populates table_id for existing table"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "existing_table"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (= (:id t1) (get-in result ["t" :table_id])))))

      (testing "preserves existing table_id"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "existing_table" :table_id 999}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (= 999 (get-in result ["t" :table_id])))))

      (testing "leaves table_id nil for non-existent table ref"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "nonexistent"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (nil? (get-in result ["t" :table_id])))))

      (testing "handles mixed int and map entries"
        (let [source-tables {"t1" (:id t1)
                             "t2" {:database_id (:id db) :schema nil :table "existing_table"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (map? (get result "t1")))
          (is (= (:id t1) (get-in result ["t1" :table_id])))
          (is (= (:id t1) (get-in result ["t2" :table_id]))))))))

(deftest resolve-source-tables-test
  (testing "resolve-source-tables returns {alias -> table_id} map"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "table_one" :schema nil}
                   :model/Table    t2 {:db_id (:id db) :name "table_two" :schema nil}]
      (testing "passes through integer entries (old format)"
        (is (= {"t" 123} (transforms.util/resolve-source-tables {"t" 123}))))

      (testing "resolves map with table_id"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "table_one" :table_id (:id t1)}}]
          (is (= {"t" (:id t1)} (transforms.util/resolve-source-tables source-tables)))))

      (testing "looks up table_id for map without it"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "table_one"}}]
          (is (= {"t" (:id t1)} (transforms.util/resolve-source-tables source-tables)))))

      (testing "throws for non-existent table"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "nonexistent"}}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: nonexistent"
                                (transforms.util/resolve-source-tables source-tables)))))

      (testing "throws with schema in error message"
        (let [source-tables {"t" {:database_id (:id db) :schema "my_schema" :table "nonexistent"}}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: my_schema\.nonexistent"
                                (transforms.util/resolve-source-tables source-tables)))))

      (testing "handles mixed entries (old and new format)"
        (let [source-tables {"t1" (:id t1)
                             "t2" {:database_id (:id db) :schema nil :table "table_two"}}]
          (is (= {"t1" (:id t1) "t2" (:id t2)}
                 (transforms.util/resolve-source-tables source-tables))))))))

(deftest source-tables-readable?-test
  (testing "source-tables-readable? function"
    (mt/with-premium-features #{:transforms :transforms-python}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}
                       :model/Table {table-id :id} {:db_id db-id :name "test_table"}]
          (binding [api/*current-user-id* (mt/user->id :lucky)]
            (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/view-data :unrestricted
              (testing "returns true for query transform when user can read database"
                (let [transform {:source {:type :query
                                          :query {:database db-id}}}]
                  (is (true? (transforms.util/source-tables-readable? transform)))))

              (testing "returns true for python transform when user can read all source tables"
                (let [transform {:source {:type :python
                                          :source-tables {"t1" table-id}}}]
                  (is (true? (transforms.util/source-tables-readable? transform)))))

              (testing "handles source tables with table_id in map format"
                (let [transform {:source {:type :python
                                          :source-tables {"t1" {:table_id table-id}}}}]
                  (is (true? (transforms.util/source-tables-readable? transform))))))))))))

(deftest source-tables-readable-permissions-test
  (testing "source-tables-readable? with various permission levels"
    (mt/with-premium-features #{:transforms :transforms-python}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}
                       :model/Table {table1-id :id} {:db_id db-id :name "test_table_1"}
                       :model/Table {table2-id :id} {:db_id db-id :name "test_table_2"}]

          (testing "Query transforms - blocked database access"
            (let [transform {:source {:type  :query
                                      :query {:database db-id}}}]
              (mt/with-user-in-groups [group {:name "Blocked Group"}
                                       user [group]]
                (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/view-data :blocked
                  (mt/with-db-perm-for-group! group db-id :perms/view-data :blocked
                    (binding [api/*current-user-id* (:id user)]
                      (is (false? (transforms.util/source-tables-readable? transform))
                          "User with blocked database access should not be able to read source database")))))))

          (testing "Python transforms - blocked database access"
            (let [transform {:source {:type          :python
                                      :source-tables {"t1" table1-id}}}]
              (mt/with-user-in-groups [group {:name "Blocked Group"}
                                       user [group]]
                (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/view-data :blocked
                  (mt/with-db-perm-for-group! group db-id :perms/view-data :blocked
                    (binding [api/*current-user-id* (:id user)]
                      (is (false? (transforms.util/source-tables-readable? transform))
                          "User with blocked database access should not be able to read source tables")))))))

          (testing "Python transforms - granular access but missing some tables"
            (let [transform {:source {:type          :python
                                      :source-tables {"t1" table1-id
                                                      "t2" table2-id}}}]
              (mt/with-user-in-groups [group {:name "Limited Granular Group"}
                                       user [group]]
                ;; Block all-users from viewing data at database level, then grant specific access via test group
                (mt/with-no-data-perms-for-all-users!
                  (mt/with-db-perm-for-group! group db-id :perms/view-data :unrestricted
                    (mt/with-db-perm-for-group! group db-id :perms/create-queries :query-builder-and-native
                      ;; Block table2 for the test group only
                      (data-perms/set-table-permission! (:id group) table2-id :perms/view-data :blocked)
                      (binding [api/*current-user-id* (:id user)]
                        (is (false? (transforms.util/source-tables-readable? transform))
                            "User who cannot read all source tables should have source_readable=false")))))))))))))

(deftest handle-transform-complete-sets-transform-id-test
  (testing "handle-transform-complete! sets transform_id on the target table"
    (mt/with-premium-features #{:transforms}
      (let [target {:type "table" :schema nil :name "test_output_table"}]
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}
                       :model/Transform {transform-id :id :as transform} {:target target}
                       :model/Table {table-id :id :as table} {:db_id db-id :name "test_output_table" :schema nil}
                       :model/TransformRun {run-id :id} {:transform_id transform-id
                                                         :status "running"
                                                         :run_method "manual"}]
          (with-redefs [transforms.util/sync-target!                       (constantly table)
                        events/publish-event!                              (constantly nil)
                        transforms.util/execute-secondary-index-ddl-if-required! (constantly nil)]
            (transforms.util/handle-transform-complete! :run-id run-id :transform transform :db db)
            (is (= transform-id
                   (t2/select-one-fn :transform_id :model/Table :id table-id)))))))))

(deftest transform-hydration-test
  (testing "hydrating :transform on a table"
    (mt/with-premium-features #{:transforms}
      (let [target {:type "table" :schema nil :name "hydration_test_table"}]
        (mt/with-temp [:model/Transform {transform-id :id} {:target target :name "Test Hydration Transform"}
                       :model/Table table {:transform_id transform-id}]
          (let [hydrated (t2/hydrate table :transform)]
            (is (some? (:transform hydrated)))
            (is (= transform-id (-> hydrated :transform :id))))))))

  (testing "hydrating :transform returns nil when transform_id is nil"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Table table {:transform_id nil}]
        (let [hydrated (t2/hydrate table :transform)]
          (is (nil? (:transform hydrated))))))))

(deftest ^:parallel massage-sql-query-test
  (testing "massage-sql-query sets disable-remaps? and disable-max-results?"
    (let [query    {:database 1, :type :query, :query {:source-table 1}}
          massaged (transforms.util/massage-sql-query query)]
      (is (true? (get-in massaged [:middleware :disable-remaps?])))
      (is (true? (get-in massaged [:middleware :disable-max-results?]))))))

(deftest compile-source-no-limit-test
  (testing "compile-source produces SQL without a LIMIT clause"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (let [transform {:source {:type  "query"
                                  :query (mt/mbql-query venues)}}
              [sql] (transforms.util/compile-source transform)]
          (is (string? sql))
          (is (not (re-find #"(?i)\bLIMIT\b" sql))
              (str "Expected no LIMIT clause in compiled SQL, got: " sql)))))))
