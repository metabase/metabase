(ns ^:mb/driver-tests metabase.transforms.util-test
  "Tests for transform utility functions."
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.canceling :as transforms.canceling]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
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
        (is (true? (transforms.u/is-temp-transform-table? table-with-schema)))
        (is (true? (transforms.u/is-temp-transform-table? table-without-schema)))))))

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
              (transforms-base.u/create-table-from-schema! driver db-id table-schema)
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
    (let [matching-timestamp? #'transforms-base.u/matching-timestamp?
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
        (is (nil? (transforms-base.u/batch-lookup-table-ids [])))
        (is (nil? (transforms-base.u/batch-lookup-table-ids nil))))

      (testing "looks up table without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}]
              result (transforms-base.u/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)} result))))

      (testing "looks up table with schema"
        (let [refs [{:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms-base.u/batch-lookup-table-ids refs)]
          (is (= {[(:id db) "my_schema" "table_two"] (:id t2)} result))))

      (testing "handles mixed refs with and without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}
                    {:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms-base.u/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)
                  [(:id db) "my_schema" "table_two"] (:id t2)}
                 result))))

      (testing "returns empty for non-existent table"
        (let [refs [{:database_id (:id db) :schema nil :table "nonexistent"}]
              result (transforms-base.u/batch-lookup-table-ids refs)]
          (is (= {} result)))))))

(deftest normalize-source-tables-test
  (testing "normalize-source-tables enriches vec entries"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "existing_table" :schema nil}]
      (testing "enriches entry with table_id but no table metadata"
        (let [result (transforms-base.u/normalize-source-tables [{:alias "t" :table_id (:id t1)}])
              entry  (first result)]
          (is (= (:id db) (:database_id entry)))
          (is (= "existing_table" (:table entry)))
          (is (= (:id t1) (:table_id entry)))))

      (testing "throws for non-existent table_id"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found for ids: 999999"
                              (transforms-base.u/normalize-source-tables [{:alias "t" :table_id 999999}]))))

      (testing "populates table_id for existing table ref"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "existing_table"}]
              result (transforms-base.u/normalize-source-tables source-tables)]
          (is (= (:id t1) (:table_id (first result))))))

      (testing "preserves existing table_id when table metadata present"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "existing_table" :table_id 999}]
              result (transforms-base.u/normalize-source-tables source-tables)]
          (is (= 999 (:table_id (first result))))))

      (testing "creates transform target table for non-existent table ref"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "nonexistent"}]
              result (transforms-base.u/normalize-source-tables source-tables)]
          (is (int? (:table_id (first result))))))

      (testing "handles entries needing different kinds of enrichment"
        (let [source-tables [{:alias "t1" :table_id (:id t1)}
                             {:alias "t2" :database_id (:id db) :schema nil :table "existing_table"}]
              result (transforms-base.u/normalize-source-tables source-tables)]
          (is (= "existing_table" (:table (first result))))
          (is (= (:id t1) (:table_id (first result))))
          (is (= (:id t1) (:table_id (second result)))))))))

(deftest resolve-source-tables-test
  (testing "resolve-source-tables returns entries with :table_id filled in"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "table_one" :schema nil}
                   :model/Table    t2 {:db_id (:id db) :name "table_two" :schema nil}]
      (testing "resolves entry with table_id"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "table_one" :table_id (:id t1)}]
              result        (transforms-base.u/resolve-source-tables source-tables)]
          (is (= (:id t1) (:table_id (first result))))))

      (testing "looks up table_id for entry without it"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "table_one"}]
              result        (transforms-base.u/resolve-source-tables source-tables)]
          (is (= (:id t1) (:table_id (first result))))))

      (testing "throws for non-existent table"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema nil :table "nonexistent"}]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: nonexistent"
                                (transforms-base.u/resolve-source-tables source-tables)))))

      (testing "throws with schema in error message"
        (let [source-tables [{:alias "t" :database_id (:id db) :schema "my_schema" :table "nonexistent"}]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: my_schema\.nonexistent"
                                (transforms-base.u/resolve-source-tables source-tables)))))

      (testing "handles multiple entries"
        (let [source-tables [{:alias "t1" :table_id (:id t1) :database_id (:id db) :schema nil}
                             {:alias "t2" :database_id (:id db) :schema nil :table "table_two"}]
              result        (transforms-base.u/resolve-source-tables source-tables)]
          (is (= (:id t1) (:table_id (first result))))
          (is (= (:id t2) (:table_id (second result)))))))))

(deftest source-tables-readable?-test
  (testing "source-tables-readable? function"
    (mt/with-premium-features #{:transforms-basic :transforms-python}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}
                       :model/Table {table-id :id} {:db_id db-id :name "test_table"}]
          (binding [api/*current-user-id* (mt/user->id :lucky)]
            (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/view-data :unrestricted
              (testing "returns true for query transform when user can read database"
                (let [transform {:source {:type :query
                                          :query {:database db-id}}}]
                  (is (true? (transforms.u/source-tables-readable? transform)))))

              (testing "returns true for python transform when user can read all source tables"
                (let [transform {:source {:type :python
                                          :source-tables [{:alias "t1" :table_id table-id}]}}]
                  (is (true? (transforms.u/source-tables-readable? transform)))))

              (testing "handles source tables with table_id"
                (let [transform {:source {:type :python
                                          :source-tables [{:alias "t1" :table_id table-id}]}}]
                  (is (true? (transforms.u/source-tables-readable? transform))))))))))))

(deftest source-tables-readable-permissions-test
  (testing "source-tables-readable? with various permission levels"
    (mt/with-premium-features #{:transforms-basic :transforms-python}
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
                      (is (false? (transforms.u/source-tables-readable? transform))
                          "User with blocked database access should not be able to read source database")))))))

          (testing "Python transforms - blocked database access"
            (let [transform {:source {:type          :python
                                      :source-tables [{:alias "t1" :table_id table1-id}]}}]
              (mt/with-user-in-groups [group {:name "Blocked Group"}
                                       user [group]]
                (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/view-data :blocked
                  (mt/with-db-perm-for-group! group db-id :perms/view-data :blocked
                    (binding [api/*current-user-id* (:id user)]
                      (is (false? (transforms.u/source-tables-readable? transform))
                          "User with blocked database access should not be able to read source tables")))))))

          (testing "Python transforms - granular access but missing some tables"
            (let [transform {:source {:type          :python
                                      :source-tables [{:alias "t1" :table_id table1-id}
                                                      {:alias "t2" :table_id table2-id}]}}]
              (mt/with-user-in-groups [group {:name "Limited Granular Group"}
                                       user [group]]
                ;; Block all-users from viewing data at database level, then grant specific access via test group
                (mt/with-no-data-perms-for-all-users!
                  (mt/with-db-perm-for-group! group db-id :perms/view-data :unrestricted
                    (mt/with-db-perm-for-group! group db-id :perms/create-queries :query-builder-and-native
                      ;; Block table2 for the test group only
                      (data-perms/set-table-permission! (:id group) table2-id :perms/view-data :blocked)
                      (binding [api/*current-user-id* (:id user)]
                        (is (false? (transforms.u/source-tables-readable? transform))
                            "User who cannot read all source tables should have source_readable=false")))))))))))))

(deftest activate-table-and-mark-computed-sets-is-writable-false-test
  (testing "activate-table-and-mark-computed! sets is_writable to false on computed transform tables"
    (let [target {:type "table" :schema nil :name "test_computed_writable"}
          synced-table (atom nil)]
      (mt/with-temp [:model/Database db {:engine :h2}]
        ;; Mock sync-table! to just create the table in Metabase without needing a real DB table
        (with-redefs [sync/create-table! (fn [database table-map]
                                           (let [created (t2/insert-returning-instance!
                                                          :model/Table
                                                          {:db_id          (:id database)
                                                           :name           (:name table-map)
                                                           :schema         (:schema table-map)
                                                           :active         true
                                                           :is_writable    (:is_writable table-map)
                                                           :data_source    (:data_source table-map)
                                                           :data_authority (:data_authority table-map)})]
                                             (reset! synced-table created)
                                             created))
                      sync/sync-table!   (constantly nil)]
          (transforms-base.u/activate-table-and-mark-computed! db target)
          (is (some? @synced-table))
          (let [table (t2/select-one :model/Table (:id @synced-table))]
            (is (= :computed (:data_authority table)))
            (is (false? (:is_writable table))
                "Computed transform tables should have is_writable=false")))))))

(deftest execute-sets-transform-id-on-target-table-test
  (testing "Executing a query transform sets transform_id on the target table"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms-basic}
        (let [target {:type "table" :schema nil :name "test_output_table"}]
          ;; The Transform after-insert hook creates a provisional table for the target,
          ;; so we don't need to create one explicitly.
          (mt/with-temp [:model/Transform {transform-id :id :as transform}
                         {:target target
                          :source {:type  "query"
                                   :query (lib/query (mt/metadata-provider) (mt/mbql-query venues))}}]
            (let [table-id (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "test_output_table" :schema nil)]
              ;; Mock execute-base! to return success without actually running a query,
              ;; run-cancelable-transform! to bypass schema creation / cancellation infra,
              ;; and sync-target! to skip driver calls but still return the provisional table
              ;; so complete-execution! can set transform_id on it.
              (mt/with-dynamic-fn-redefs
                [transforms-base.i/execute-base!        (constantly {:status :succeeded})
                 transforms-base.u/sync-target!         (fn [_target _database]
                                                          (t2/select-one :model/Table table-id))
                 transforms.u/run-cancelable-transform! (fn [_run-id _transform _driver _details run-fn & _opts]
                                                          (run-fn (a/promise-chan) nil))]
                (transforms.execute/execute! transform {:run-method :manual})
                (is (= transform-id
                       (t2/select-one-fn :transform_id :model/Table :id table-id)))))))))))

(deftest transform-hydration-test
  (testing "hydrating :transform on a table"
    (mt/with-premium-features #{:transforms-basic}
      (let [target {:type "table" :schema nil :name "hydration_test_table"}]
        (mt/with-temp [:model/Transform {transform-id :id} {:target target :name "Test Hydration Transform"}
                       :model/Table table {:transform_id transform-id}]
          (let [hydrated (t2/hydrate table :transform)]
            (is (some? (:transform hydrated)))
            (is (= transform-id (-> hydrated :transform :id))))))))

  (testing "hydrating :transform returns nil when transform_id is nil"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Table table {:transform_id nil}]
        (let [hydrated (t2/hydrate table :transform)]
          (is (nil? (:transform hydrated))))))))

(deftest jdbc-unreturned-connection-timeout-covers-transform-timeout-test
  (testing "the c3p0 unreturnedConnectionTimeout default is at least as long as transform-timeout.
            Per-query timeouts are enforced via Statement.setQueryTimeout; this pool setting only acts as a
            leak-detector, so it must not undercut a legitimate long transform."
    ;; transform-timeout is premium-gated; without the feature flag its getter returns the default regardless of
    ;; any `with-temporary-setting-values` override, which would silently defeat these assertions.
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [jdbc-data-warehouse-unreturned-connection-timeout-seconds nil]
        (binding [driver.settings/*query-timeout-ms* (u/minutes->ms 20)]
          (testing "transform-timeout larger than query-timeout -> transform-timeout wins"
            (mt/with-temporary-setting-values [transform-timeout 240]
              (is (= (* 240 60)
                     (driver.settings/jdbc-data-warehouse-unreturned-connection-timeout-seconds)))))
          (testing "query-timeout larger than transform-timeout -> query-timeout wins"
            (binding [driver.settings/*query-timeout-ms* (u/minutes->ms 60)]
              (mt/with-temporary-setting-values [transform-timeout 10]
                (is (= (* 60 60)
                       (driver.settings/jdbc-data-warehouse-unreturned-connection-timeout-seconds)))))))
        (testing "an explicit override still wins over the computed default"
          (mt/with-temporary-setting-values [jdbc-data-warehouse-unreturned-connection-timeout-seconds 15
                                             transform-timeout                                         240]
            (is (= 15 (driver.settings/jdbc-data-warehouse-unreturned-connection-timeout-seconds)))))))))

(deftest sql-jdbc-statement-honors-dynamic-query-timeout-test
  (testing "statement-or-prepared-statement applies *query-timeout-ms* via Statement.setQueryTimeout, so rebinding
            the var inside a transform makes per-statement timeouts follow transform-timeout rather than the shorter
            MB_DB_QUERY_TIMEOUT_MINUTES."
    (mt/test-driver :h2
      (let [db (mt/db)]
        (sql-jdbc.execute/do-with-connection-with-options
         :h2 db {:write? false}
         (fn [^java.sql.Connection conn]
           (testing "default dynamic scope -> statement picks up db-query-timeout"
             (binding [driver.settings/*query-timeout-ms* (u/minutes->ms 3)]
               (with-open [^java.sql.Statement stmt (sql-jdbc.execute/statement-or-prepared-statement
                                                     :h2 conn "SELECT 1" [] nil)]
                 (is (= (* 3 60) (.getQueryTimeout stmt))))))
           (testing "transform rebinding -> statement picks up transform-timeout"
             (binding [driver.settings/*query-timeout-ms* (u/minutes->ms 90)]
               (with-open [^java.sql.Statement stmt (sql-jdbc.execute/statement-or-prepared-statement
                                                     :h2 conn "SELECT 1" [] nil)]
                 (is (= (* 90 60) (.getQueryTimeout stmt))))))))))))

(deftest run-cancelable-transform!-propagates-timeout-to-driver-test
  (testing "run-cancelable-transform! rebinds *query-timeout-ms* for the whole transform body, so any driver that
            reads the dynamic var at query time (SQL JDBC via setQueryTimeout, Mongo/Druid/BigQuery directly) sees
            the transform timeout instead of db-query-timeout."
    (let [driver-observed-timeout-ms (atom nil)]
      (with-redefs [driver/schema-exists?                            (constantly true)
                    driver/create-schema-if-needed!                  (constantly nil)
                    transforms-base.u/get-source-range-params        (constantly nil)
                    transforms-base.u/save-run-checkpoint-range!     (constantly nil)
                    transforms-base.u/save-watermark!                (constantly nil)
                    transforms.canceling/chan-start-timeout-vthread! (constantly nil)
                    transforms.canceling/chan-start-run!             (constantly nil)
                    transforms.canceling/chan-end-run!               (constantly nil)
                    transform-run/succeed-started-run!               (constantly nil)]
        (mt/with-premium-features #{:transforms-basic}
          (mt/with-temporary-setting-values [transform-timeout 90]
            (transforms.u/run-cancelable-transform!
             1 {:id 1} :h2 {:db-id 1 :conn-spec nil :output-schema "x"}
             (fn [_cancel-chan _range-params]
               (reset! driver-observed-timeout-ms driver.settings/*query-timeout-ms*))))))
      (is (= (u/minutes->ms 90) @driver-observed-timeout-ms)))))

(deftest ^:parallel massage-sql-query-test
  (testing "massage-sql-query sets disable-remaps? and disable-max-results?"
    (let [query    {:database 1, :type :query, :query {:source-table 1}}
          massaged (transforms-base.u/massage-sql-query query)]
      (is (true? (get-in massaged [:middleware :disable-remaps?])))
      (is (true? (get-in massaged [:middleware :disable-max-results?]))))))

(deftest compile-source-no-limit-test
  (testing "compile-source produces SQL without a LIMIT clause"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms-basic}
        (let [transform {:source {:type  "query"
                                  :query (lib/query (mt/metadata-provider) (mt/mbql-query venues))}}
              {:keys [query]} (transforms-base.u/compile-source transform (transforms-base.u/get-source-range-params transform))]
          (is (string? query))
          (is (not (re-find #"(?i)\bLIMIT\b" query))
              (str "Expected no LIMIT clause in compiled SQL, got: " query)))))))
