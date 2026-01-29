(ns ^:mb/driver-tests metabase.driver.snowflake-test
  (:require
   [clojure.data :as data]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.reader.edn :as edn]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters :as params]
   [metabase.driver.snowflake :as driver.snowflake]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.secrets.core :as secret]
   [metabase.sync.core :as sync]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.impl.get-or-create :as test.get-or-create]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.snowflake :as test.data.snowflake]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.random :as u.random]
   [metabase.warehouses.models.database :as database]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query->native! [query]
  (let [check-sql-fn (fn [_ _ sql & _]
                       (throw (ex-info "done" {::native-query sql})))]
    (with-redefs [sql-jdbc.execute/prepared-statement check-sql-fn
                  sql-jdbc.execute/execute-statement! check-sql-fn]
      (try
        (qp/process-query query)
        (is false "no statement created")
        (catch Exception e
          (-> e u/all-ex-data ::native-query))))))

(use-fixtures :each (fn [thunk]
                      ;; 1. If sync fails when loading a test dataset, don't swallow the error; throw an Exception so we
                      ;;    can debug it. This is much less confusing when trying to fix broken tests.
                      ;;
                      ;; 2. Make sure we're in Honey SQL 2 mode for all the little SQL snippets we're compiling in these
                      ;;    tests.
                      (binding [sync-util/*log-exceptions-and-continue?* false]
                        (thunk))))

(deftest ^:sequential sanity-check-test
  (mt/test-driver
    :snowflake
    (mt/dataset
      attempted-murders
      (is (= [20]
             (mt/first-row
              (mt/run-mbql-query attempts
                {:aggregation [[:count]]})))))))

(deftest ^:sequential describe-fields-test
  (mt/test-driver
    :snowflake
    (is (=? [{:name "id"
              :database-type "NUMBER"
              :database-required false
              :database-is-auto-increment true
              :base-type :type/Number
              :json-unfolding false
              :database-position 0
              :pk? true}
             {:name "name"
              :database-type "VARCHAR"
              :database-required false
              :database-is-auto-increment false
              :base-type :type/Text
              :json-unfolding false
              :database-position 1}
             {:name "category_id"
              :database-type "NUMBER"
              :database-required false
              :database-is-auto-increment false
              :base-type :type/Number
              :json-unfolding false
              :database-position 2}
             {:name "latitude"
              :database-type "DOUBLE"
              :database-required false
              :database-is-auto-increment false
              :base-type :type/Float
              :json-unfolding false
              :database-position 3}
             {:name "longitude"
              :database-type "DOUBLE"
              :database-required false
              :database-is-auto-increment false
              :base-type :type/Float
              :json-unfolding false
              :database-position 4}
             {:name "price"
              :database-type "NUMBER"
              :database-required false
              :database-is-auto-increment false
              :base-type :type/Number
              :json-unfolding false
              :database-position 5}]
            (sort-by :database-position
                     (into [] (fetch-metadata/fields-metadata (mt/db) {:table-names ["venues"]})))))))

(deftest ^:parallel quote-name-test
  (is (nil? (#'driver.snowflake/quote-name nil)))
  (is (= "\"alma\"" (#'driver.snowflake/quote-name "alma")))
  (is (= "\"Al\"\"aba\"\"Ma\"" (#'driver.snowflake/quote-name "Al\"aba\"Ma"))))

(deftest ^:parallel connection-details->spec-test
  (let [details {:role nil
                 :warehouse "COMPUTE_WH"
                 :additional-options nil
                 :db "v3_sample-dataset"
                 :password "passwd"
                 :let-user-control-scheduling false
                 :private-key-options "uploaded"
                 :private-key-source nil
                 :port nil
                 :advanced-options true
                 :private-key-id 1
                 :schema-filters-type "all"
                 :account "ls10467.us-east-2.aws"
                 :private-key-value nil
                 :tunnel-enabled false
                 :engine :snowflake
                 :private-key-creator-id 3
                 :user "SNOWFLAKE_DEVELOPER"
                 :private-key-created-at "2024-01-05T19:10:30.861839Z"
                 :host ""}]
    (testing "Database name is always quoted in jdbc spec"
      (is (=? "\"v3_sample-dataset\""
              (:db (sql-jdbc.conn/connection-details->spec :snowflake details)))))
    (testing "Subname is replaced if hostname is provided (#22133)"
      (are [use-hostname alternative-host expected-subname] (=? expected-subname
                                                                (:subname (let [details (-> details
                                                                                            (assoc :host alternative-host)
                                                                                            (assoc :use-hostname use-hostname))]
                                                                            (sql-jdbc.conn/connection-details->spec :snowflake details))))
        true nil "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        true "" "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        true "  " "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        true "snowflake.example.com/" "//snowflake.example.com/"
        true "snowflake.example.com" "//snowflake.example.com/"
        false nil "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        false "" "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        false "snowflake.example.com/" "//ls10467.us-east-2.aws.snowflakecomputing.com/"
        false "snowflake.example.com" "//ls10467.us-east-2.aws.snowflakecomputing.com/"))
    (testing "Application parameter is set to identify Metabase connections"
      (is (= "Metabase_Metabase"
             (:application (sql-jdbc.conn/connection-details->spec :snowflake details)))))))

(deftest ddl-statements-test
  (testing "make sure we didn't break the code that is used to generate DDL statements when we add new test datasets"
    (with-redefs [test.data.snowflake/qualified-db-name (constantly "v4_test-data")]
      (testing "Create DB DDL statements"
        (is (= "DROP DATABASE IF EXISTS \"v4_test-data\"; CREATE DATABASE \"v4_test-data\";"
               (sql.tx/create-db-sql :snowflake (mt/get-dataset-definition defs/test-data)))))
      (testing "Create Table DDL statements"
        (is (= (map
                #(str/replace % #"\s+" " ")
                ["DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"users\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"users\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"last_login\" TIMESTAMP_NTZ, \"password\" TEXT, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"categories\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"categories\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT NOT NULL,
                PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"venues\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"venues\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"category_id\" INTEGER, \"latitude\" FLOAT, \"longitude\" FLOAT, \"price\" INTEGER, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"checkins\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"checkins\" (\"id\" INTEGER AUTOINCREMENT, \"date\" DATE,
                \"user_id\" INTEGER, \"venue_id\" INTEGER, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"products\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"products\" (\"id\" INTEGER AUTOINCREMENT, \"ean\" TEXT,
                \"title\" TEXT, \"category\" TEXT, \"vendor\" TEXT, \"price\" FLOAT, \"rating\" FLOAT, \"created_at\"
                TIMESTAMP_TZ, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"people\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"people\" (\"id\" INTEGER AUTOINCREMENT, \"address\" TEXT,
                \"email\" TEXT, \"password\" TEXT, \"name\" TEXT, \"city\" TEXT, \"longitude\" FLOAT, \"state\" TEXT,
                \"source\" TEXT, \"birth_date\" DATE, \"zip\" TEXT, \"latitude\" FLOAT, \"created_at\" TIMESTAMP_TZ,
                PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"reviews\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"reviews\" (\"id\" INTEGER AUTOINCREMENT, \"product_id\" INTEGER,
                \"reviewer\" TEXT, \"rating\" INTEGER, \"body\" TEXT, \"created_at\" TIMESTAMP_TZ, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v4_test-data\".\"PUBLIC\".\"orders\";"
                 "CREATE TABLE \"v4_test-data\".\"PUBLIC\".\"orders\" (\"id\" INTEGER AUTOINCREMENT, \"user_id\" INTEGER,
                \"product_id\" INTEGER, \"subtotal\" FLOAT, \"tax\" FLOAT, \"total\" FLOAT, \"discount\" FLOAT, \"created_at\"
                TIMESTAMP_TZ, \"quantity\" INTEGER, PRIMARY KEY (\"id\")) ;"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"venues\" ADD CONSTRAINT \"gory_id_categories_-1429799958\"
                FOREIGN KEY (\"category_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"categories\" (\"id\");"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"kins_user_id_users_-1503129306\"
                FOREIGN KEY (\"user_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"users\" (\"id\");"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ckins_venue_id_venues_55711779\"
                FOREIGN KEY (\"venue_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"venues\" (\"id\");"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"reviews\" ADD CONSTRAINT \"roduct_id_products_-1093665274\"
                FOREIGN KEY (\"product_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"products\" (\"id\");"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"orders\" ADD CONSTRAINT \"ders_user_id_people_1646240302\"
                FOREIGN KEY (\"user_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"people\" (\"id\");"
                 "ALTER TABLE \"v4_test-data\".\"PUBLIC\".\"orders\" ADD CONSTRAINT \"roduct_id_products_-1151848842\"
                FOREIGN KEY (\"product_id\") REFERENCES \"v4_test-data\".\"PUBLIC\".\"products\" (\"id\");"])
               (ddl/create-db-tables-ddl-statements :snowflake (-> (mt/get-dataset-definition defs/test-data)
                                                                   (update :database-name #(str "v4_" %))))))))))

(deftest ^:parallel simple-select-probe-query-test
  (testing "the simple-select-probe-query used by have-select-privilege? should be qualified with the Database name. Ignore blank keys."
    (mt/test-driver :snowflake
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        {:database (assoc (mt/db)
                                                          :details {:db     " "
                                                                    :dbname "dbname"})})
        (is (= ["SELECT TRUE AS \"_\" FROM \"PUBLIC\".\"table\" WHERE 1 <> 1 LIMIT 0"]
               (sql-jdbc.describe-database/simple-select-probe-query :snowflake "PUBLIC" "table")))))))

(deftest ^:sequential have-select-privilege?-test
  (mt/test-driver :snowflake
    (qp.store/with-metadata-provider (mt/id)
      (sql-jdbc.execute/do-with-connection-with-options
       :snowflake
       (mt/db)
       nil
       (fn [^java.sql.Connection conn]
         (is (sql-jdbc.sync/have-select-privilege? :snowflake conn "PUBLIC" "venues")))))))

(deftest ^:sequential can-set-schema-in-additional-options
  (mt/test-driver :snowflake
    (qp.store/with-metadata-provider (mt/id)
      (let [schema "INFORMATION_SCHEMA"
            db-details (:details (mt/db))
            details (-> db-details
                        (assoc :additional-options (format "schema=%s" schema))
                        (dissoc :private-key-id)
                        (assoc :private-key-options "uploaded")
                        (assoc :private-key-value (mt/priv-key->base64-uri (tx/db-test-env-var-or-throw :snowflake :private-key)))
                        (assoc :use-password false))]
        (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [:snowflake details]]
          (is (= [{:s schema}] (jdbc/query spec ["select CURRENT_SCHEMA() s"])))
          (is (= 1 (count (jdbc/query spec ["select * from \"TABLES\" limit 1"])))))))))

(deftest ^:sequential additional-options-test
  (mt/test-driver
    :snowflake
    (let [existing-details (dissoc (:details (mt/db)) :password)]
      (testing "By default no subname"
        (is (=? {:subname complement :connection-uri complement}
                (sql-jdbc.conn/connection-details->spec :snowflake existing-details))))
      (testing "add additional-options to subname"
        (is (=? {:subname #".*foo=bar.*" :connection-uri complement}
                (sql-jdbc.conn/connection-details->spec
                 :snowflake
                 (assoc existing-details :additional-options "foo=bar")))))
      (testing "role has no affect if private-key is missing"
        (is (=? {:subname #".*foo=bar.*" :connection-uri complement}
                (sql-jdbc.conn/connection-details->spec
                 :snowflake
                 (assoc existing-details
                        :role "test-role"
                        :additional-options "foo=bar")))))
      (testing "private-key-value sets connection-uri and so make sure it doesn't clobber additional-options or role"
        (is (=? {:subname #".*foo=bar.*" :connection-uri #".*foo=bar.*role=test-role"}
                (sql-jdbc.conn/connection-details->spec
                 :snowflake
                 (assoc existing-details
                        :role "test-role"
                        :private-key-value "pk"
                        :additional-options "foo=bar"))))))))

(deftest describe-database-test
  ;; This test calls driver/describe-database which queries Snowflake directly.
  ;; Requires real sync (not fake-sync) so tables actually exist in Snowflake.
  (mt/test-driver :snowflake
    (mt/dataset airports
      (tx/with-driver-supports-feature! [:snowflake :test/use-fake-sync false]
        (testing "describe-database"
          (let [expected-tables #{:tables
                                  #{{:name "continent",    :schema "PUBLIC", :description nil}
                                    {:name "municipality", :schema "PUBLIC", :description nil}
                                    {:name "region",       :schema "PUBLIC", :description nil}
                                    {:name "country",      :schema "PUBLIC", :description nil}
                                    {:name "airport",      :schema "PUBLIC", :description nil}}}]
            (testing "should work with normal details"
              (is (= expected-tables
                     (:tables (driver/describe-database :snowflake (mt/db))))))
            (testing "should accept either `:db` or `:dbname` in the details, working around a bug with the original impl"
              (is (= expected-tables
                     (:tables (driver/describe-database :snowflake (update (mt/db) :details set/rename-keys {:db :dbname}))))))
            (testing "should throw an Exception if details have neither `:db` nor `:dbname`"
              (is (thrown? Exception
                           (driver/describe-database :snowflake (update (mt/db) :details set/rename-keys {:db :xyz})))))
            (testing "should use the NAME FROM DETAILS instead of the DB DISPLAY NAME to fetch metadata (#8864)"
              (is (= expected-tables
                     (:tables (driver/describe-database :snowflake (assoc (mt/db) :name "ABC"))))))))))))

(deftest describe-database-default-schema-test
  (testing "describe-database should include Tables from all schemas even if the DB has a default schema (#38135)"
    (mt/test-driver :snowflake
      (let [details     (assoc (mt/dbdef->connection-details :snowflake :db (tx/map->DatabaseDefinition {:database-name (str "Default-Schema-Test-" (u.random/random-name))}))
                               ;; simulate a DB default schema or session schema by including it in the connection
                               ;; details... see
                               ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1706219065462619?thread_ts=1706156558.940489&cid=C04DN5VRQM6
                               :schema "PUBLIC"
                               :schema-filters-type "inclusion"
                               :schema-filters-patterns "Test-Schema")
            db-name     (:db details)
            schema-name "Test-Schema"
            table-name  "Test-Table"
            field-name  "Test-ID"
            spec        (sql-jdbc.conn/connection-details->spec :snowflake details)]
        ;; create the snowflake DB
        (sql-jdbc.execute/do-with-connection-with-options
         :snowflake spec nil
         (fn [^java.sql.Connection conn]
           (doseq [stmt (letfn [(identifier [& args]
                                  (str/join \. (map #(str \" % \") args)))]
                          [(format "DROP DATABASE IF EXISTS %s;" (identifier db-name))
                           (format "CREATE DATABASE %s;" (identifier db-name))
                           (format "CREATE SCHEMA %s;" (identifier db-name schema-name))
                           (format "CREATE TABLE %s (%s INTEGER AUTOINCREMENT);" (identifier db-name schema-name table-name) (identifier field-name))
                           (format "GRANT SELECT ON %s TO PUBLIC;" (identifier db-name schema-name table-name))])]
             (jdbc/execute! {:connection conn} [stmt] {:transaction? false}))))
        ;; fetch metadata
        (mt/with-temp [:model/Database database {:engine :snowflake, :details details}]
          (is (=? {:tables #{{:name table-name, :schema schema-name, :description nil}}}
                  (driver/describe-database :snowflake database))))))))

(deftest describe-database-views-test
  (mt/test-driver :snowflake
    (testing "describe-database views"
      (let [details (mt/dbdef->connection-details :snowflake :db (tx/map->DatabaseDefinition {:database-name (str "views_test_" (u.random/random-name))}))
            db-name (:db details)
            spec    (sql-jdbc.conn/connection-details->spec :snowflake details)]
        ;; create the snowflake DB
        (doseq [stmt [(format "DROP DATABASE IF EXISTS \"%s\";" db-name)
                      (format "CREATE DATABASE \"%s\";" db-name)]]
          (jdbc/execute! spec [stmt] {:transaction? false}))
        ;; create the DB object
        (mt/with-temp [:model/Database database {:engine :snowflake, :details details}]
          (let [sync! #(sync/sync-database! database)]
            ;; create a view
            (doseq [statement [(format "CREATE VIEW \"%s\".\"PUBLIC\".\"example_view\" AS SELECT 'hello world' AS \"name\";" db-name)
                               (format "GRANT SELECT ON \"%s\".\"PUBLIC\".\"example_view\" TO PUBLIC;" db-name)]]
              (jdbc/execute! spec [statement]))
            ;; now sync the DB
            (sync!)
            ;; now take a look at the Tables in the database, there should be an entry for the view
            (is (= [{:name "example_view"}]
                   (map (partial into {})
                        (t2/select [:model/Table :name] :db_id (u/the-id database)))))))))))

(defn- do-with-dynamic-table
  [thunk]
  (mt/dataset (mt/dataset-definition
               "dynamic-db"
               [["metabase_users"
                 [{:field-name "name" :base-type :type/Text}]
                 [["mb_qnkhuat"]]]])
    (let [details (:details (mt/db))]
      (jdbc/execute! (sql-jdbc.conn/connection-details->spec driver/*driver* details)
                     [(format "CREATE OR REPLACE DYNAMIC TABLE \"%s\".\"PUBLIC\".\"metabase_fan\" target_lag = '1 minute' warehouse = 'COMPUTE_WH' AS
                              SELECT * FROM \"%s\".\"PUBLIC\".\"metabase_users\" WHERE \"%s\".\"PUBLIC\".\"metabase_users\".\"name\" LIKE 'MB_%%';"
                              (:db details) (:db details) (:db details))])
      (thunk))))

(defmacro with-dynamic-table
  "Create a db with 2 tables: metabase_users and metabase_fan, in which metabase_fan is a dynamic table."
  [& body]
  `(do-with-dynamic-table (fn [] ~@body)))

(deftest sync-dynamic-tables-test
  (testing "Should be able to sync dynamic tables"
    (mt/test-driver :snowflake
      (with-dynamic-table
        (sync/sync-database! (t2/select-one :model/Database (mt/id)))
        (testing "both base tables and dynamic tables should be synced"
          (is (= #{"metabase_fan" "metabase_users"}
                 (t2/select-fn-set :name :model/Table :db_id (mt/id))))
          (testing "the fields for dynamic tables are synced correctly"
            (is (= #{{:name "name" :base_type :type/Text}
                     {:name "id" :base_type :type/Number}}
                   (set (t2/select [:model/Field :name :base_type]
                                   :table_id (t2/select-one-pk :model/Table :name "metabase_fan" :db_id (mt/id))))))))))))

(deftest dynamic-table-helpers-test
  (testing "test to make sure various methods called on dynamic tables work"
    (mt/test-driver :snowflake
      (with-dynamic-table
        (sql-jdbc.execute/do-with-connection-with-options
         :snowflake
         (mt/db)
         nil
         (fn [conn]
           (let [dynamic-table (t2/select-one :model/Table :name "metabase_fan" :db_id (mt/id))
                 normal-table  (t2/select-one :model/Table :name "metabase_users" :db_id (mt/id))
                 db-name       (-> (mt/db) :details :db)]
             (testing "dynamic-table?"
               (testing "returns true for dynamic table"
                 (is (true? (#'driver.snowflake/dynamic-table? conn db-name (:schema dynamic-table) (:name dynamic-table)))))

               (testing "returns false for normal table"
                 (is (false? (#'driver.snowflake/dynamic-table? conn db-name (:schema normal-table) (:name normal-table)))))

               (testing "returns false if db-name is invalid, make sure we don't throw an exception"
                 (is (false? (#'driver.snowflake/dynamic-table? conn (mt/random-name) (:schema normal-table) (:name normal-table))))))

             (testing "sql-jdbc.describe-table/get-table-pks"
               (testing "returns empty array for dynamic table"
                 (is (= [] (sql-jdbc.describe-table/get-table-pks :snowflake conn db-name dynamic-table))))

               (testing "also works if db-name is nil"
                 (is (= [] (sql-jdbc.describe-table/get-table-pks :snowflake conn nil dynamic-table)))))

             (testing "driver/describe-table-fks returns empty set for dynamic table"
               #_{:clj-kondo/ignore [:deprecated-var]}
               (is (= #{} (driver/describe-table-fks :snowflake (mt/db) dynamic-table)))))))))))

(deftest ^:sequential describe-table-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table uses the NAME FROM DETAILS too"
      (is (= {:name   "categories"
              :schema "PUBLIC"
              :fields #{{:name                       "id"
                         :database-type              "NUMBER"
                         :base-type                  :type/Number
                         :pk?                        true
                         :database-position          0
                         :database-is-auto-increment true
                         :database-is-nullable       false
                         :database-required          false
                         :json-unfolding             false}
                        {:name                       "name"
                         :database-type              "VARCHAR"
                         :base-type                  :type/Text
                         :database-position          1
                         :database-is-auto-increment false
                         :database-is-nullable       false
                         :database-required          true
                         :json-unfolding             false}}}
             (driver/describe-table :snowflake (assoc (mt/db) :name "ABC") (t2/select-one :model/Table :id (mt/id :categories))))))))

(deftest ^:sequential describe-table-fks-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table-fks uses the NAME FROM DETAILS too"
      (is (= #{{:fk-column-name   "category_id"
                :dest-table       {:name "categories", :schema "PUBLIC"}
                :dest-column-name "id"}}
             #_{:clj-kondo/ignore [:deprecated-var]}
             (driver/describe-table-fks :snowflake (assoc (mt/db) :name "ABC") (t2/select-one :model/Table :id (mt/id :venues))))))))

(deftest can-change-from-password-test
  (mt/test-driver
    :snowflake
    (let [details (:details (mt/db))
          pk-key "testing"]
      (is (=?
           {:user some?
            :password some?
            :private_key_file complement}
           (sql-jdbc.conn/connection-details->spec :snowflake details)))
      (is (=?
           {:user some?
            :password some?
            :private_key_file complement}
            ;; Before `use-password` password took precedence over a key file
           (sql-jdbc.conn/connection-details->spec :snowflake (assoc details :private-key-value pk-key))))
      (is (=?
           {:user some?
            :password complement
            :private_key_file some?}
           (sql-jdbc.conn/connection-details->spec :snowflake (assoc details :password nil :private-key-value pk-key))))
      (is (=?
           {:user some?
            :password complement
            :private_key_file some?}
           (sql-jdbc.conn/connection-details->spec :snowflake (assoc details :use-password false :private-key-value pk-key)))))))

(deftest can-connect-test
  (let [pk-key (mt/format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
        pk-user (tx/db-test-env-var :snowflake :pk-user)
        pk-db (tx/db-test-env-var :snowflake :pk-db "SNOWFLAKE_SAMPLE_DATA")]
    (mt/test-driver :snowflake
      (let [can-connect? (partial driver/can-connect? :snowflake)]
        (is (can-connect? (:details (mt/db)))
            "can-connect? should return true for normal Snowflake DB details")
        (let [original-query jdbc/query]
          ;; make jdbc/query return a falsey value, but should still be able to connect
          (with-redefs [jdbc/query (fn fake-jdbc-query
                                     ([db sql-params] (fake-jdbc-query db sql-params {}))
                                     ([db sql-params opts] (if (str/starts-with? sql-params "SHOW OBJECTS IN DATABASE")
                                                             nil
                                                             (original-query db sql-params (or opts {})))))]
            (is (can-connect? (:details (mt/db))))))
        (is (thrown?
             net.snowflake.client.jdbc.SnowflakeSQLException
             (can-connect? (assoc (:details (mt/db)) :db (mt/random-name))))
            "can-connect? should throw for Snowflake databases that don't exist (#9511)")
        (is (can-connect? (-> (:details (mt/db))
                              (assoc :host (str (get-in (mt/db) [:details :account])
                                                ".snowflakecomputing.com")
                                     :use-hostname true)
                              (dissoc :account)))
            "can-connect? with host and no account")
        (when (and pk-key pk-user)
          (mt/with-temp-file [pk-path]
            (mt/with-temp [:model/Secret {path-secret-id :id} {:name "Private key for Snowflake"
                                                               :kind :pem-cert
                                                               :source "file-path"
                                                               :value pk-path}
                           :model/Secret {upload-secret-id :id} {:name "Private key upload for Snowflake"
                                                                 :kind :pem-cert
                                                                 :source "uploaded"
                                                                 :value (u/string-to-bytes pk-key)}
                           :model/Secret {base64-upload-secret-id :id} {:name "Private key base64 upload for Snowflake"
                                                                        :kind :pem-cert
                                                                        :source "uploaded"
                                                                        :value (mt/bytes->base64-data-uri (u/string-to-bytes pk-key))}]
              (testing "private key authentication via uploaded keys or local key with path stored in a secret"
                (spit pk-path pk-key)
                (is (can-connect? (-> (:details (mt/db))
                                      (assoc :host (str (get-in (mt/db) [:details :account])
                                                        ".snowflakecomputing.com")
                                             :use-hostname true)
                                      (dissoc :password :account)
                                      (merge {:db pk-db :user pk-user} {:private-key-id path-secret-id})))
                    "can-connect? with pk, host and no account")
                (doseq [to-merge [;; uploaded string
                                  {:private-key-value pk-key
                                   :private-key-options "uploaded"}
                                  ;; uploaded byte array
                                  {:private-key-value (mt/bytes->base64-data-uri (u/string-to-bytes pk-key))
                                   :private-key-options "uploaded"}
                                  ;; uploaded byte array without private-key-options
                                  {:private-key-value (mt/bytes->base64-data-uri (u/string-to-bytes pk-key))}
                                  ;; saved local path
                                  {:private-key-id path-secret-id}
                                  ;; saved uploaded bytes
                                  {:private-key-id upload-secret-id}
                                  ;; saved base64
                                  {:private-key-id base64-upload-secret-id}]]
                  (let [details (-> (:details (mt/db))
                                    (dissoc :password)
                                    (merge {:db pk-db :user pk-user} to-merge))]
                    (is (can-connect? details))))))))))))

(deftest maybe-test-and-migrate-details!-test
  ;; We create very ambiguous database details and loop over which version should succeed on connect.
  (let [pk-key (mt/format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
        pk-user (tx/db-test-env-var-or-throw :snowflake :pk-user)
        pk-db (tx/db-test-env-var-or-throw :snowflake :pk-db "SNOWFLAKE_SAMPLE_DATA")]
    (mt/test-driver
      :snowflake
      (mt/dataset
        places-cam-likes
        (mt/with-temp-copy-of-db
          (mt/with-temp-file [pk-path]
            (mt/with-temp [:model/Secret {secret-id :id :as secret} {:name "Private key for Snowflake"
                                                                     :kind :pem-cert
                                                                     :source "file-path"
                                                                     :value pk-path}]
              (doseq [use-password [nil false true]
                      options [nil "uploaded" "local"]
                      :let [details (-> (mt/db)
                                        :details
                                        (merge {:db pk-db
                                                :user pk-user
                                                :use-password use-password
                                                :private-key-options options
                                                :private-key-value pk-key
                                                :private-key-path (str pk-path ".copy")
                                                :private-key-id secret-id}))
                            all-possible-details (driver/db-details-to-test-and-migrate :snowflake details)]
                      details-to-succeed all-possible-details
                      :let [uses-secret? (seq (set/intersection (m/remove-vals nil? details-to-succeed)
                                                                #{:private-key-id :private-key-path :private-key-value}))]]
                ;; Looping over all-possible-details and succeeding on details-to-succeed is stateful:
                ;;  If a password detail succeeds it will delete the secret, this resets it.
                (let [updated-secret (secret/upsert-secret-value! secret-id (:name secret) (:kind secret) (:source secret) (:value secret))]
                  (when (not= (:id updated-secret) secret-id)
                    (t2/update! :model/Secret :id (:id updated-secret) {:id secret-id})))
                (with-redefs [driver/can-connect? (fn [_ d] (= d (assoc details-to-succeed :engine :snowflake)))]
                  (testing (format "use-password: %s private-key-options: %s uses-secret? %s" use-password options uses-secret?)
                    (spit pk-path pk-key)
                    (is (= 3 (count all-possible-details)))
                    (t2/update! (t2/table-name :model/Database) (mt/id) {:details (json/encode details)})
                    (testing "Connection succeeds and migration occurs"
                      (log/with-no-logs
                        (log.capture/with-log-messages-for-level [messages [metabase.warehouses.models.database :info]]
                          (is (= details-to-succeed
                                 (database/maybe-test-and-migrate-details! (assoc (t2/select-one :model/Database (mt/id))
                                                                                  :details details))))
                          (let [success-re #"^Successfully connected, migrating to: (.*)"
                                msgs (messages)
                                migrating-to (edn/read-string (str/replace (:message (second msgs)) success-re "$1"))
                                success-keys (set (keys details-to-succeed))
                                [_ keys-removed _] (data/diff success-keys (set (keys details)))]
                            (is (=? [{:level :info, :message "Attempting to connect to 3 possible legacy details"}
                                     {:level :info, :message success-re}]
                                    msgs))
                            (is (= {:keys success-keys
                                    :keys-removed keys-removed}
                                   migrating-to))))
                        (let [migrated-details (:details (t2/select-one :model/Database (mt/id)))
                              expected-migrated (cond-> details-to-succeed
                                                  uses-secret? (assoc :private-key-id secret-id)
                                                  :always (dissoc :private-key-options :private-key-value :private-key-path))]

                          (testing "Migration persists as expected"
                            (is (= expected-migrated migrated-details)))
                          (testing "Migration results in unambiguous details"
                            (is (nil? (driver/db-details-to-test-and-migrate :snowflake migrated-details)))))
                        (testing "Secrets persist as expected"
                          (when uses-secret?
                            (let [source (case (:private-key-options details-to-succeed "local")
                                           "local" :file-path
                                           "uploaded" :uploaded)]
                              (is (=? {:value (u/string-to-bytes (if (= :file-path source)
                                                                   (:private-key-path details-to-succeed pk-path)
                                                                   pk-key))
                                       :source source}
                                      (secret/latest-for-id secret-id))))))))))))))))))

(deftest ^:synchronized pk-auth-custom-role-e2e-test
  (mt/test-driver
    :snowflake
    (let [account           (tx/db-test-env-var-or-throw :snowflake :account)
          warehouse         (tx/db-test-env-var-or-throw :snowflake :warehouse)
         ;; User with default role PULIC. To access the db custom role has to be used.
          user              (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-custom-user)
          private-key-value (mt/format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
          db                (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-db)
          database          {:name    "Snowflake RSA test DB custom"
                             :engine  :snowflake
                            ;; Details as collected from `api handler POST / database` are used.
                             :details {:role                nil
                                       :warehouse           warehouse
                                       :db                  db
                                       :password            nil
                                       :private-key-options "uploaded"
                                       :advanced-options    false
                                       :schema-filters-type "all"
                                       :account             account
                                       :private-key-value   (mt/bytes->base64-data-uri (u/string-to-bytes private-key-value))
                                       :tunnel-enabled      false
                                       :user                user}}]
     ;; TODO: We should make those message returned when role is incorrect more descriptive!
      (testing "Database can not be accessed with `nil` default role"
        (is (= "Looks like the Database name is incorrect."
               (:message (mt/user-http-request :crowberto :post 400 "database"
                                               database)))))
      (testing "Database can not be accessed with PUBLIC role (default)"
        (is (= "Looks like the Database name is incorrect."
               (:message (mt/user-http-request :crowberto :post 400 "database"
                                               (assoc-in database [:details :role] "PUBLIC"))))))
      (testing "Database can be created using specified role"
       ;; Map containing :details is expected to be database, hence considering request successful.
        (is (contains? (mt/user-http-request :crowberto :post 200 "database"
                                             (assoc-in database [:details :role]
                                                       (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-role)))
                       :details))
        ;; As the request is asynchronous, wait for sync to complete.
        (Thread/sleep 7000))
      (let [[db :as dbs]       (t2/select :model/Database :name "Snowflake RSA test DB custom")
            [table :as tables] (t2/select :model/Table :db_id (:id db))
            fields             (t2/select :model/Field :table_id (:id table))]
        (testing "Created database is correctly synced"
          (testing "Application database contains one database, one table and one new field"
            (is (= 1 (count dbs)))
            (is (= 1 (count tables)))
            (is (= 2 (count fields)))))
        (testing "Querying the database returns expected results"
          (is (= [[1 "John Toucan Smith"]]
                 (mt/rows (qp/process-query {:database (:id db)
                                             :type :query
                                             :query {:source-table (:id table)}})))))
       ;; Cleanup
        (u/ignore-exceptions (t2/delete! :model/Database (:id db)))
        (u/ignore-exceptions (t2/delete! :model/Table (:id table)))
        (u/ignore-exceptions (t2/delete! :model/Field :id [:in (map :id fields)]))
        (u/ignore-exceptions (t2/delete! :model/FieldValues :field_id [:in (map :id fields)]))))))

(deftest ^:synchronized pk-auth-default-role-e2e-test
  (mt/test-driver
    :snowflake
    (let [account           (tx/db-test-env-var-or-throw :snowflake :account)
          warehouse         (tx/db-test-env-var-or-throw :snowflake :warehouse)
         ;; User with default role PULIC. To access the db custom role has to be used.
          user              (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-default-user)
          private-key-value (mt/format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
          db                (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-db)
          database          {:name    "Snowflake RSA test DB default"
                             :engine  :snowflake
                            ;; Details as collected from `api handler POST / database` are used.
                             :details {:role                nil
                                       :warehouse           warehouse
                                       :db                  db
                                       :password            nil
                                       :private-key-options "uploaded"
                                       :advanced-options    false
                                       :schema-filters-type "all"
                                       :account             account
                                       :private-key-value   (mt/bytes->base64-data-uri (u/string-to-bytes private-key-value))
                                       :tunnel-enabled      false
                                       :user                user}}]
      (testing "Database can be created using _default_ `nil` role"
       ;; Map containing :details is expected to be database, hence considering request successful.
        (is (contains? (mt/user-http-request :crowberto :post 200 "database" database)
                       :details))
        ;; As the request is asynchronous, wait for sync to complete.
        (Thread/sleep 7000))
      (let [[db :as dbs]       (t2/select :model/Database :name "Snowflake RSA test DB default")
            [table :as tables] (t2/select :model/Table :db_id (:id db))
            fields             (t2/select :model/Field :table_id (:id table))]
        (testing "Created database is correctly synced"
          (testing "Application database contains one database, one table and one new field"
            (is (= 1 (count dbs)))
            (is (= 1 (count tables)))
            (is (= 2 (count fields)))))
        (testing "Querying the database returns expected results"
          (is (= [[1 "John Toucan Smith"]]
                 (mt/rows (qp/process-query {:database (:id db)
                                             :type :query
                                             :query {:source-table (:id table)}})))))
       ;; Cleanup
        (u/ignore-exceptions (t2/delete! :model/Database (:id db)))
        (u/ignore-exceptions (t2/delete! :model/Table (:id table)))
        (u/ignore-exceptions (t2/delete! :model/Field :id [:in (map :id fields)]))
        (u/ignore-exceptions (t2/delete! :model/FieldValues :field_id [:in (map :id fields)]))))))

(deftest ^:parallel replacement-snippet-date-param-test
  (mt/test-driver :snowflake
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:replacement-snippet     "'2014-08-02'::date"
              :prepared-statement-args nil}
             (sql.params.substitution/->replacement-snippet-info :snowflake (params/->Date "2014-08-02")))))))

(deftest report-timezone-test
  (mt/test-driver :snowflake
    (testing "Make sure temporal parameters are set and returned correctly when report-timezone is set (#11036, #39769)"
      (let [query {:database   (mt/id)
                   :type       :native
                   :native     {:query         "SELECT {{filter_date}}"
                                :template-tags {:filter_date {:name         "filter_date"
                                                              :display_name "Just A Date"
                                                              :type         "date"}}}
                   :parameters [{:type   "date/single"
                                 :target ["variable" ["template-tag" "filter_date"]]
                                 :value  "2014-08-02"}]}]
        (mt/with-native-query-testing-context query
          (letfn [(run-query []
                    (mt/rows (qp/process-query query)))]
            (testing "baseline"
              (is (= [["2014-08-02T00:00:00Z"]]
                     (run-query))))
            (testing "with report-timezone"
              (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
                (is (= [["2014-08-02T00:00:00-07:00"]]
                       (run-query)))))))))))

(deftest report-timezone-test-2
  (mt/test-driver :snowflake
    (testing "Make sure temporal values are returned correctly when report-timezone is set (#11036, #39769)"
      (let [query {:database   (mt/id)
                   :type       :native
                   :native     {:query         (str "SELECT {{filter_date}}, \"last_login\" "
                                                    (format "FROM \"%s\".\"PUBLIC\".\"users\" "
                                                            (test.data.snowflake/qualified-db-name
                                                             (tx/get-dataset-definition
                                                              (data.impl/resolve-dataset-definition *ns* 'test-data))))
                                                    "WHERE date_trunc('day', CAST(\"last_login\" AS timestamp))"
                                                    "    = date_trunc('day', CAST({{filter_date}} AS timestamp))")
                                :template-tags {:filter_date {:name         "filter_date"
                                                              :display_name "Just A Date"
                                                              :type         "date"}}}
                   :parameters [{:type   "date/single"
                                 :target ["variable" ["template-tag" "filter_date"]]
                                 :value  "2014-08-02"}]}]
        (mt/with-native-query-testing-context query
          (letfn [(run-query []
                    (mt/rows (qp/process-query query)))]
            (testing "baseline (no report-timezone set)"
              (is (= [["2014-08-02T00:00:00Z" "2014-08-02T12:30:00Z"]
                      ["2014-08-02T00:00:00Z" "2014-08-02T09:30:00Z"]]
                     (run-query))))
            (testing "with report timezone set"
              (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
                (is (= [["2014-08-02T00:00:00-07:00" "2014-08-02T12:30:00-07:00"]
                        ["2014-08-02T00:00:00-07:00" "2014-08-02T09:30:00-07:00"]]
                       (run-query)))))))))))

(defn- test-temporal-instance
  "Test that `java.time` instance `t` is set correctly (as a parameter) and returned correctly."
  [t expected]
  (mt/test-driver :snowflake
    (testing "(#11036, #39769)"
      (let [[sql & params] (sql.qp/format-honeysql :snowflake {:select [[(sql.qp/->honeysql :snowflake t) :t]]})
            query {:database (mt/id)
                   :type     :native
                   :native   {:query  sql
                              :params (vec params)}}]
        (mt/with-native-query-testing-context query
          (testing (format "\nt = ^%s %s" (.getName (class t)) (pr-str t))
            (is (= [expected]
                   (mt/first-row (qp/process-query query))))))))))

(deftest ^:parallel local-date-time-parameter-test
  (test-temporal-instance
   #t "2024-04-25T14:44:00"
   "2024-04-25T14:44:00Z"))

(deftest local-date-time-parameter-report-timezone-test
  (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
    (test-temporal-instance
     #t "2024-04-25T14:44:00"
     "2024-04-25T14:44:00-07:00")))

(deftest ^:parallel offset-date-time-parameter-test
  (test-temporal-instance
   #t "2024-04-25T14:44:00-07:00"
   "2024-04-25T21:44:00Z"))

(deftest offset-date-time-parameter-report-timezone-test
  (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
    (test-temporal-instance
     #t "2024-04-25T14:44:00-07:00"
     "2024-04-25T14:44:00-07:00")))

(deftest ^:sequential zoned-date-time-parameter-test
  (test-temporal-instance
   #t "2024-04-25T14:44:00-07:00[US/Pacific]"
   "2024-04-25T21:44:00Z"))

(deftest zoned-date-time-parameter-report-timezone-test
  (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
    (test-temporal-instance
     #t "2024-04-25T14:44:00-07:00[US/Pacific]"
     "2024-04-25T14:44:00-07:00")))

(deftest week-start-test
  (mt/test-driver :snowflake
    (testing "The WEEK_START session setting is correctly incorporated"
      (letfn [(run-dayofweek-query [date-str]
                (-> (mt/rows
                     (qp/process-query {:database   (mt/id)
                                        :type       :native
                                        :native     {:query         "SELECT DAYOFWEEK({{filter_date}})"
                                                     :template-tags {:filter_date {:name         "filter_date"
                                                                                   :display_name "Just A Date"
                                                                                   :type         "date"}}}
                                        :parameters [{:type   "date/single"
                                                      :target ["variable" ["template-tag" "filter_date"]]
                                                      :value  date-str}]}))
                    ffirst))]
        (testing "under the default value of 7 (Sunday)"
          (mt/with-temporary-setting-values [start-of-week :sunday]
            (is (= 1 (run-dayofweek-query "2021-01-10")) "Sunday (first day of the week)")
            (is (= 2 (run-dayofweek-query "2021-01-11")) "Monday (second day of the week)")))
        (testing "when we control it via the Metabase setting value"
          (mt/with-temporary-setting-values [start-of-week :monday]
            (is (= 7 (run-dayofweek-query "2021-01-10")) "Sunday (last day of week now)")
            (is (= 1 (run-dayofweek-query "2021-01-11")) "Monday (first day of week now)")))))))

(deftest first-day-of-week-test
  (mt/test-driver :snowflake
    (testing "Day-of-week should work correctly regardless of what the `start-of-week` Setting is set to (#20999)"
      (mt/dataset test-data
        (doseq [[start-of-week friday-int] [[:friday 1]
                                            [:monday 5]
                                            [:sunday 6]]]
          (mt/with-temporary-setting-values [start-of-week start-of-week]
            (let [query (mt/mbql-query people
                          {:breakout    [!day-of-week.birth_date]
                           :aggregation [[:count]]
                           :filter      [:= $birth_date "1986-12-12"]})]
              (mt/with-native-query-testing-context query
                (is (= [[friday-int 1]]
                       (mt/rows (qp/process-query query))))))))))))

(deftest ^:parallel normalize-test
  (mt/test-driver :snowflake
    (testing "details should be normalized coming out of the DB"
      (mt/with-temp [:model/Database db {:name    "Legacy Snowflake DB"
                                         :engine  :snowflake,
                                         :details {:account  "my-instance"
                                                   :regionid "us-west-1"}}]
        (is (= {:account "my-instance.us-west-1"}
               (:details db)))))))

(deftest ^:parallel normalize-use-password-test
  (mt/test-driver :snowflake
    (testing "details should be normalized coming out of the DB"
      (mt/with-temp [:model/Database db1 {:name    "Legacy Snowflake DB"
                                          :engine  :snowflake,
                                          :details {:password "abc"}}
                     :model/Database db2 {:name    "Legacy Snowflake DB"
                                          :engine  :snowflake,
                                          :details {:password "abc"
                                                    :private-key-path "def"}}
                     :model/Database db3 {:name    "Legacy Snowflake DB"
                                          :engine  :snowflake,
                                          :details {:use-password false
                                                    :password "abc"}}]
        (is (= {:password "abc" :use-password true} (:details db1)))
        (is (=? {:password "abc" :private-key-id int? :use-password complement} (:details db2)))
        (is (= {:password "abc" :use-password false} (:details db3)))))))

(deftest ^:parallel set-role-statement-test
  (testing "set-role-statement should return a USE ROLE command, with the role quoted if it contains special characters"
    ;; No special characters
    (is (= "USE ROLE MY_ROLE;"        (driver.sql/set-role-statement :snowflake "MY_ROLE")))
    (is (= "USE ROLE ROLE123;"        (driver.sql/set-role-statement :snowflake "ROLE123")))
    (is (= "USE ROLE lowercase_role;" (driver.sql/set-role-statement :snowflake "lowercase_role")))

    ;; Special characters
    (is (= "USE ROLE \"Role.123\";"   (driver.sql/set-role-statement :snowflake "Role.123")))
    (is (= "USE ROLE \"$role\";"      (driver.sql/set-role-statement :snowflake "$role")))))

(deftest remark-test
  (testing "Queries should have a remark formatted as JSON appended to them with additional metadata"
    (mt/test-driver :snowflake
      (let [expected-map {"pulseId" nil
                          "serverId" (system/site-uuid)
                          "client" "Metabase"
                          "queryHash" "cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2"
                          "queryType" "query"
                          "cardId" 1234
                          "dashboardId" 5678
                          "context" "ad-hoc"
                          "userId" 1000
                          "databaseId" (mt/id)}
            result-query (driver/prettify-native-form
                          :snowflake
                          (query->native!
                           (assoc
                            (mt/mbql-query users {:limit 2000})
                            :parameters [{:type   "id"
                                          :target [:dimension [:field (mt/id :users :id) nil]]
                                          :value  ["1" "2" "3"]}]
                            :info {:executed-by  1000
                                   :card-id      1234
                                   :dashboard-id 5678
                                   :context      :ad-hoc
                                   :query-hash   (byte-array [-53 -125 -44 -10 -18 -36 37 14 -37 15 44 22 -8 -39 -94 30
                                                              93 66 -13 34 -52 -20 -31 73 76 -114 -13 -42 52 88 31 -30])})))
            result-comment (second (re-find #"-- (\{.*\})" result-query))
            result-map (json/decode result-comment)]
        (is (= expected-map result-map))))))

(mt/defdataset dst-change
  [["dst_tz_test" [{:field-name "dtz"
                    :base-type :type/DateTimeWithTZ}]
    [["2023-09-30 23:59:59 +1000"]      ; September
     ["2023-10-01 00:00:00 +1000"]      ; October before DST starts
     ["2023-10-01 05:00:00 +1100"]      ; October after DST starts
     ["2023-11-01 05:00:00 +1100"]]]])  ; November

(deftest date-bucketing-test
  (testing "#37065"
    (mt/test-driver :snowflake
      (mt/dataset dst-change
        (let [metadata-provider (mt/metadata-provider)
              ds-tz-test (lib.metadata/table metadata-provider (mt/id :dst_tz_test))
              dtz        (lib.metadata/field metadata-provider (mt/id :dst_tz_test :dtz))
              query      (-> (lib/query metadata-provider ds-tz-test)
                             (lib/breakout dtz)
                             (lib/aggregate (lib/count)))]
          (mt/with-native-query-testing-context query
            (is (= [["2023-09-30T00:00:00+10:00" 1]
                    ["2023-10-01T00:00:00+10:00" 2]
                    ["2023-11-01T00:00:00+11:00" 1]]
                   (mt/with-temporary-setting-values [report-timezone "Australia/Sydney"]
                     (mt/rows (qp/process-query query)))))))))))

(deftest ^:parallel connection-str->parameters-test
  (testing "Returns nil for invalid connection string"
    (are [conn-str] (= nil (driver.snowflake/connection-str->parameters conn-str))
      nil "" "asdf" "snowflake:jdbc://x")))

(deftest ^:parallel connection-str->parameters-test-2
  (testing "Returns `\"ACCOUNT\"` for valid strings of no parameters"
    (are [conn-str] (= {"ACCOUNT" "x"} (driver.snowflake/connection-str->parameters conn-str))
      "jdbc:snowflake://x.snowflakecomputing.com"
      "jdbc:snowflake://x.snowflakecomputing.com/"
      "jdbc:snowflake://x.snowflakecomputing.com/?")))

(deftest ^:parallel connection-str->parameters-test-3
  (testing "Returns decoded parameters"
    (let [role "!@#$%^&*()"]
      (is (= {"ACCOUNT" "x"
              "ROLE" role}
             (driver.snowflake/connection-str->parameters (str "jdbc:snowflake://x.snowflakecomputing.com/"
                                                               "?role=" (codec/url-encode role))))))))

(deftest ^:parallel connection-str->parameters-test-4
  (testing "Returns multiple url parameters"
    (let [role "!@#$%^&*()"]
      (is (= {"ACCOUNT" "x"
              "ROLE" role
              "FOO" "bar"}
             (driver.snowflake/connection-str->parameters (str "jdbc:snowflake://x.snowflakecomputing.com/"
                                                               "?role=" (codec/url-encode role)
                                                               "&foo=bar")))))))

(deftest ^:parallel connection-str->parameters-test-5
  (testing (str "Returns nothing for role suffixed keys "
                "(https://github.com/metabase/metabase/pull/43602#discussion_r1628043704)")
    (let [role "!@#$%^&*()"
          params (driver.snowflake/connection-str->parameters (str "jdbc:snowflake://x.snowflakecomputing.com/"
                                                                   "?asdfrole=" (codec/url-encode role)))]
      (is (not (contains? params "ROLE")))
      (is (contains? params "ASDFROLE")))))

(deftest ^:sequential filter-on-variant-column-test
  (testing "We should still let you do various filter types on VARIANT (anything) columns (#45206)"
    (mt/test-driver :snowflake
      (let [variant-base-type (sql-jdbc.sync/database-type->base-type :snowflake :VARIANT)
            metadata-provider (lib.tu/merged-mock-metadata-provider
                               (mt/metadata-provider)
                               {:fields [{:id             (mt/id :venues :name)
                                          :base-type      variant-base-type
                                          :effective-type variant-base-type
                                          :database-type  "VARIANT"}]})
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
            venues-id         (lib.metadata/field metadata-provider (mt/id :venues :id))
            query             (lib/query metadata-provider venues)]
        (is (= variant-base-type
               (lib/type-of query venues-name)
               (lib/type-of query (lib/ref venues-name))))
        (let [query (-> query
                        (lib/expression "expr" (lib/regex-match-first venues-name "(Red)"))
                        (lib/order-by venues-id :asc)
                        (lib/limit 1))]
          (mt/with-native-query-testing-context query
            (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 "Red"]]
                   (mt/rows (qp/process-query query))))))))))

;;;;
;;;; GOOD DATETIMES IN BELIZE
;;;; Testing Snowflake timestamp types in relative date time filter.
;;;; (In Belize they know no DST anymore.)
;;;;

(def ^:private belize-offset (t/zone-offset "-06:00"))

(defn- rows-for-good-datetimes-in-belize
  []
  (let [number-of-points (* 4 3)
        today-dt (t/truncate-to (t/offset-date-time belize-offset) :days)
        first-dt-point (t/- today-dt (t/days 2))
        dt-points (for [i (range number-of-points)]
                    (t/+ first-dt-point (t/hours (* 6 i))))
        various-offset-strs ["-10:00" "-04:00" "+02:00" "+09:00"]]
    (mapv (fn [today-dt offset-str]
            (vector (t/with-offset-same-instant today-dt (t/zone-offset "Z"))
                    (t/with-offset-same-instant today-dt (t/zone-offset offset-str))
                    (t/local-date-time today-dt)
                    ;;;; Shift local date time for belize offset so timestamp_ltz has same instant as rest!
                    ;;   Even though later in the test the user with America/Belize timezone does the data loading,
                    ;;   the timestamps have to be adjusted.
                    ;;   I believe that it is because of either (1) us hardcoding the :timestamp connection property
                    ;;   to UTC (see the `connection-details->spec :snowflake`) or (2) the fact that the JVM timezone
                    ;;   is set to UTC.
                    (t/+ (t/local-date-time today-dt) (t/hours 6))))
          dt-points
          (cycle various-offset-strs))))

;; BEWARE: No cleanup is done atm. It is expected that every CI run creates its own instance of this database.
(mt/defdataset good-datetimes-in-belize
  [["GOOD_DATETIMES" [{:field-name "IN_Z_OFFSET"
                       :base-type {:native "timestamptz"}}
                      {:field-name "IN_VARIOUS_OFFSETS"
                       :base-type {:native "timestamptz"}}
                      {:field-name "JUST_NTZ"
                       :base-type {:native "timestampntz"}}
                      {:field-name "JUST_LTZ"
                       :base-type {:native "timestampltz"}}]
    (rows-for-good-datetimes-in-belize)]])

(deftest ^:parallel sync-datetime-types
  (mt/test-driver
    :snowflake
    (mt/dataset
      good-datetimes-in-belize
      (is (= [["id" "NUMBER" :type/Number 0]
              ["IN_Z_OFFSET" "TIMESTAMPTZ" :type/DateTimeWithLocalTZ 1]
              ["IN_VARIOUS_OFFSETS" "TIMESTAMPTZ" :type/DateTimeWithLocalTZ 2]
              ["JUST_NTZ" "TIMESTAMPNTZ" :type/DateTime 3]
              ["JUST_LTZ" "TIMESTAMPLTZ" :type/DateTimeWithTZ 4]]
             (sort-by last
                      (into []
                            (map (juxt :name :database-type :base-type :database-position))
                            (fetch-metadata/fields-metadata (mt/db)))))))))

;; The test needs user with no report timezone set and database timezone other than UTC. That's the reason for redefs
;; prior to dataset generation.
(deftest ^:synchronized correct-timestamp-type-querying-test
  (mt/test-driver
    :snowflake
    (let [original-set-current-user-timezone! @#'test.data.snowflake/set-current-user-timezone!
          original-dbdef->connection-details (get-method tx/dbdef->connection-details :snowflake)]
      (with-redefs [test.data.snowflake/set-current-user-timezone!
                    (fn [_timezone]
                      (original-set-current-user-timezone! "America/Belize"))
                    tx/dbdef->connection-details
                    (fn [driver connection-type database-definition]
                      (-> (original-dbdef->connection-details driver connection-type database-definition)
                          (assoc :user "BELIZE_PERSON")))]
        (mt/with-temporary-setting-values [report-timezone "America/Belize"]
          (mt/dataset
            good-datetimes-in-belize
            (testing "Expected data is returned using yesterday filter"
              (let [yesterday-first     (t/- (t/truncate-to (t/offset-date-time belize-offset) :days) (t/days 1))
                    yesterday-last      (t/+ yesterday-first (t/hours 18))
                    yesterday-first-str (t/format :iso-offset-date-time yesterday-first)
                    yesterday-last-str  (t/format :iso-offset-date-time yesterday-last)]
                (doseq [[tested-field-kw base-type database-type]
                        [[:IN_Z_OFFSET        :type/DateTimeWithLocalTZ "timestamptz"]
                         [:IN_VARIOUS_OFFSETS :type/DateTimeWithLocalTZ "timestamptz"]
                         [:JUST_NTZ           :type/DateTime            "timestampntz"]
                         [:JUST_LTZ           :type/DateTimeWithTZ      "timestampltz"]]
                        :let [tested-field [:field (mt/id :GOOD_DATETIMES tested-field-kw) {:base-type base-type}]]]
                  (testing (str "on column type " database-type)
                    (let [rows (mt/rows (qp/process-query
                                         {:database (mt/id)
                                          :type     :query
                                          :query {:source-table (mt/id :GOOD_DATETIMES)
                                                  :fields [tested-field]
                                                  :filter [:time-interval tested-field -1 :day]
                                                  :order-by [[tested-field :asc]]}}))]
                      (testing "Correct rows count returned"
                        (is (= 4 (count rows))))
                      (testing "First row has expected values"
                        (is (= yesterday-first-str
                               (ffirst rows))))
                      (testing "Last row has expected values"
                        (is (= yesterday-last-str
                               (ffirst (reverse rows)))))))

                  (testing "Rows should be properly allocated to days"
                    (let [tested-day (assoc-in tested-field [2 :temporal-unit] :day)
                          tested-minute (assoc-in tested-field [2 :temporal-unit] :minute)]
                      (is (=? [[string? 4] [string? 4] [string? 4]]
                              (mt/rows
                               (qp/process-query
                                (mt/mbql-query nil
                                  {:source-table (mt/id :GOOD_DATETIMES)
                                   :aggregation [[:count]]
                                   :breakout [tested-day]})))))
                      (is (= [[yesterday-first-str 4 yesterday-first-str yesterday-last-str]]
                             (mt/rows
                              (qp/process-query
                               (mt/mbql-query nil
                                 {:source-table (mt/id :GOOD_DATETIMES)
                                  :aggregation [[:count]
                                                [:min tested-minute]
                                                [:max tested-minute]]
                                  :breakout [tested-day]
                                  :filter [:= tested-field (t/format :iso-local-date yesterday-last)]}))))))))))))))))

(deftest snowflake-all-auth-combos-test
  (mt/test-driver
    :snowflake
    (let [dbdef (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))
          details (dissoc (tx/dbdef->connection-details :snowflake :db dbdef) :password)]
      (doseq [password [nil :password]
              private-key-value [nil :private-key-value]
              private-key-path [nil :private-key-path]
              private-key-id [nil :private-key-id]
              options [nil "uploaded" "local"]
              use-password [nil true false]
              :when (< 1 (count (remove nil? [password private-key-path private-key-value private-key-id])))
              :let [idxs [password private-key-value private-key-path private-key-id options use-password]
                    new-details (m/assoc-some details
                                              :password password
                                              :private-key-value private-key-value
                                              :private-key-path private-key-path
                                              :private-key-id private-key-id
                                              :private-key-options options
                                              :use-password use-password)
                    result (some->> (driver/db-details-to-test-and-migrate :snowflake new-details)
                                    (map (comp :auth meta)))]]
        (testing "password takes precedence if use-password is true"
          (when (and password use-password)
            (is (= :password (first result))
                [idxs result])))

        (testing "password comes last if use-password is false or nil"
          (when (and password (not use-password))
            (is (= :password (last result))
                [idxs result])))

        (testing "path is preferred if options is local"
          (when (and (= "local" options) private-key-value private-key-path)
            (is (= :private-key-path (m/find-first #{:private-key-path :private-key-value} result))
                [idxs result])))

        (testing "value is preferred if options is nil or uploaded"
          (when (and (not= "local" options) private-key-value private-key-path)
            (is (= :private-key-value (m/find-first #{:private-key-path :private-key-value} result))
                [idxs result])))

        (testing "ID is checked last if path or value exists"
          (when (or (and private-key-value private-key-id)
                    (and private-key-path private-key-id))
            (is (= :private-key-id (m/find-first #{:private-key-path :private-key-value :private-key-id} (reverse result)))
                [idxs result])))))))

(deftest have-select-privelege?-timeout-test
  (mt/test-driver :snowflake
    (let [{schema :schema, table-name :name} (t2/select-one :model/Table (mt/id :checkins))]
      (qp.store/with-metadata-provider (mt/id)
        (testing "checking select privilege defaults to allow on timeout (#56737)"
          (with-redefs [sql-jdbc.describe-database/simple-select-probe-query (constantly ["SELECT SYSTEM$WAIT(3, 'SECONDS')"])]
            (binding [sql-jdbc.describe-database/*select-probe-query-timeout-seconds* 1]
              (sql-jdbc.execute/do-with-connection-with-options
               driver/*driver*
               (mt/db)
               nil
               (fn [^java.sql.Connection conn]
                 (is (true? (sql-jdbc.sync.interface/have-select-privilege?
                             driver/*driver* conn schema table-name))))))))))))

(defn- get-db-priv-key [db]
  (-> (:details db)
      (#'driver.snowflake/resolve-private-key)
      :private_key_file
      slurp))

(defn- get-priv-key-details [details pk-user priv-key-var]
  (let [priv-key (tx/db-test-env-var-or-throw :snowflake priv-key-var)]
    (merge (dissoc details :password)
           {:user pk-user
            :private-key-options "uploaded"
            :private-key-value (mt/priv-key->base64-uri priv-key)
            :use-password false})))

(deftest private-key-file-updated-test
  (mt/test-driver :snowflake
    (let [details (assoc (:details (mt/db)) :role "ACCOUNTADMIN")
          pk-user (mt/random-name)
          pub-key (tx/db-test-env-var-or-throw :snowflake :pk-public-key)
          rsa-details (get-priv-key-details details pk-user :pk-private-key)
          pub-key-2 (tx/db-test-env-var-or-throw :snowflake :pk-public-key-2)
          rsa-details-2 (get-priv-key-details details pk-user :pk-private-key-2)]
      (tx/with-temp-db-user! driver/*driver* details pk-user
        (testing "healthcheck after updating db with new private key file should work correctly"
          (mt/with-temp [:model/Database rsa-db {:engine :snowflake :details rsa-details}]
            ;; set the public key for the db user
            (test.data.snowflake/set-user-public-key details pk-user pub-key)
            ;; assert we can connect to the db with the original rsa details
            (is (= {:status "ok"} (mt/user-http-request :crowberto :get 200 (str "database/" (:id rsa-db) "/healthcheck"))))
            ;; update the snowflake rsa user to use the new public key
            (test.data.snowflake/set-user-public-key details pk-user pub-key-2)
            ;; assert we can no longer connect with the original rsa details
            (let [resp (mt/user-http-request :crowberto :get 200 (str "database/" (:id rsa-db) "/healthcheck"))]
              (is (= "error" (:status resp)))
              (is (str/starts-with? (:message resp) "JWT token is invalid.")))
            ;; update the database details to use the new rsa details
            (mt/user-http-request :crowberto :put 200 (str "database/" (:id rsa-db)) {:details rsa-details-2})
            ;; assert we can connect to the db with the new rsa details
            (is (= {:status "ok"} (mt/user-http-request :crowberto :get 200 (str "database/" (:id rsa-db) "/healthcheck"))))))
        (testing "publishing a db update event when details have changed notifies the db it was updated and clears the secret file memoization"
          (mt/with-temp [:model/Database rsa-db {:engine :snowflake :details rsa-details}]
            (let [original-priv-key (get-db-priv-key rsa-db)
                  updating-rsa-db (merge rsa-db {:details rsa-details-2})
                  _ (t2/update! :model/Database (:id rsa-db) updating-rsa-db)
                  details-changed? (not= (:details rsa-db) (:details updating-rsa-db))
                  new-rsa-db (t2/select-one :model/Database (:id rsa-db))
                  priv-key-after-update (get-db-priv-key new-rsa-db)
                  _ (events/publish-event! :event/database-update {:object new-rsa-db
                                                                   :user-id 1
                                                                   :previous-object rsa-db
                                                                   :details-changed? details-changed?})
                  priv-key-after-event (get-db-priv-key new-rsa-db)]
              (is (= rsa-db new-rsa-db))
              (is (true? details-changed?))
              (is (= original-priv-key priv-key-after-update))
              (is (not= priv-key-after-update priv-key-after-event)))))))))

(deftest ^:parallel type->database-type-test
  (testing "type->database-type multimethod returns correct Snowflake types"
    (are [base-type expected] (= expected (driver/type->database-type :snowflake base-type))
      :type/Array              [:ARRAY]
      :type/Boolean            [:BOOLEAN]
      :type/Date               [:DATE]
      :type/DateTime           [:DATETIME]
      :type/DateTimeWithLocalTZ [:TIMESTAMPTZ]
      :type/DateTimeWithTZ     [:TIMESTAMPLTZ]
      :type/Decimal            [:DECIMAL]
      :type/Float              [:DOUBLE]
      :type/Number             [:BIGINT]
      :type/Integer            [:INTEGER]
      :type/Text               [:TEXT]
      :type/Time               [:TIME])))

(deftest snowflake-string-filter-tests
  (mt/test-driver :snowflake
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          products-category (lib.metadata/field mp (mt/id :products :category))
          products-name (lib.metadata/field mp (mt/id :products :title))
          products-id (lib.metadata/field mp (mt/id :products :id))
          filter-query (fn [filter]
                         (-> (lib/query mp products)
                             (lib/filter filter)
                             (lib/order-by products-id :asc)
                             (lib/limit 3)
                             (lib/with-fields [products-id products-name products-category])))]
      (doseq [[msg filter exp-filter exp-rows] [["case insensitive contains has rows"
                                                 (-> (lib/contains products-category "GET")
                                                     (lib.options/update-options assoc :case-sensitive false))
                                                 "CONTAINS(LOWER(\"PUBLIC\".\"products\".\"category\"), 'get')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [9 "Practical Bronze Computer" "Widget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]]]

                                                ["case sensitive contains has rows"
                                                 (-> (lib/contains products-category "Gad")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "CONTAINS(\"PUBLIC\".\"products\".\"category\", 'Gad')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]
                                                  [16 "Incredible Bronze Pants" "Gadget"]]]

                                                ["case sensitive contains with no rows"
                                                 (-> (lib/contains products-category "gad")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "CONTAINS(\"PUBLIC\".\"products\".\"category\", 'gad')"
                                                 []]

                                                ["case insensitive starts with has rows"
                                                 (-> (lib/starts-with products-category "GAD")
                                                     (lib.options/update-options assoc :case-sensitive false))
                                                 "STARTSWITH(LOWER(\"PUBLIC\".\"products\".\"category\"), 'gad')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]
                                                  [16 "Incredible Bronze Pants" "Gadget"]]]

                                                ["case sensitive starts with has rows"
                                                 (-> (lib/starts-with products-category "Gad")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "STARTSWITH(\"PUBLIC\".\"products\".\"category\", 'Gad')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]
                                                  [16 "Incredible Bronze Pants" "Gadget"]]]

                                                ["case sensitive starts with has no rows"
                                                 (-> (lib/starts-with products-category "gad")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "STARTSWITH(\"PUBLIC\".\"products\".\"category\", 'gad')"
                                                 []]

                                                ["case insensitive ends with has rows"
                                                 (-> (lib/ends-with products-category "GET")
                                                     (lib.options/update-options assoc :case-sensitive false))
                                                 "ENDSWITH(LOWER(\"PUBLIC\".\"products\".\"category\"), 'get')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [9 "Practical Bronze Computer" "Widget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]]]

                                                ["case sensitive ends with has rows"
                                                 (-> (lib/ends-with products-category "get")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "ENDSWITH(\"PUBLIC\".\"products\".\"category\", 'get')"
                                                 [[5 "Enormous Marble Wallet" "Gadget"]
                                                  [9 "Practical Bronze Computer" "Widget"]
                                                  [11 "Ergonomic Silk Coat" "Gadget"]]]

                                                ["case sensitive ends with has no rows"
                                                 (-> (lib/ends-with products-category "GET")
                                                     (lib.options/update-options assoc :case-sensitive true))
                                                 "ENDSWITH(\"PUBLIC\".\"products\".\"category\", 'GET')"
                                                 []]]]
        (testing msg
          (let [result (qp/process-query (filter-query filter))]
            (is (str/includes? (-> result :data :native_form :query) exp-filter))
            (is (= exp-rows (mt/rows result)))))))))

(deftest snowflake-collate-comparison-test
  (mt/test-driver :snowflake
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          collation-query (fn [collation]
                            (let [query (-> (lib/query mp products)
                                            (lib/expression "contains_result" (lib/contains (lib/collate "café" collation) "CAFE"))
                                            (lib/limit 1))
                                  contains-expr (lib/expression-ref query "contains_result")]
                              (lib/with-fields query [contains-expr])))]
      (doseq [[collation exp-filter exp-rows] [["en-ci-ai"
                                                "CONTAINS(COLLATE('café', 'en-ci-ai'), 'CAFE')"
                                                [[true]]]
                                               ["en-ci"
                                                "CONTAINS(COLLATE('café', 'en-ci'), 'CAFE')"
                                                [[false]]]]]
        (let [result (qp/process-query (collation-query collation))]
          (is (str/includes? (-> result :data :native_form :query) exp-filter))
          (is (= exp-rows (mt/rows result))))))))

(deftest snowflake-with-dbname-in-details-gets-synced-test
  ;; This test calls driver/describe-database which queries Snowflake directly.
  ;; Requires real sync (not fake-sync) so tables actually exist in Snowflake.
  (testing "db with a valid db and an invalid dbname in details should be synced with db correctly"
    (mt/test-driver :snowflake
      (tx/with-driver-supports-feature! [:snowflake :test/use-fake-sync false]
        (let [priv-key-val      (mt/priv-key->base64-uri (tx/db-test-env-var-or-throw :snowflake :private-key))
              expected-tables   #{{:name "users",      :schema "PUBLIC", :description nil}
                                  {:name "venues",     :schema "PUBLIC", :description nil}
                                  {:name "checkins",   :schema "PUBLIC", :description nil}
                                  {:name "categories", :schema "PUBLIC", :description nil}
                                  {:name "orders",     :schema "PUBLIC", :description nil}
                                  {:name "people",     :schema "PUBLIC", :description nil}
                                  {:name "products",   :schema "PUBLIC", :description nil}
                                  {:name "reviews",    :schema "PUBLIC", :description nil}}]
          (mt/with-temp [:model/Database db {:engine :snowflake
                                             :details (-> (:details (mt/db))
                                                          (dissoc :private-key-id)
                                                          (assoc :private-key-options "uploaded")
                                                          (assoc :private-key-value priv-key-val)
                                                          (assoc :use-password false)
                                                          (assoc :dbname nil))}]
            (is (= expected-tables
                   (:tables (driver/describe-database :snowflake db))))))))))

;;; ------------------------------------------------ Fake Sync Tests ------------------------------------------------
;; Tests to validate that fake sync produces correct metadata for Snowflake.
;; The key difference from Redshift: Snowflake uses plain table names ("venues") because each
;; dataset has its own database, while Redshift uses qualified names ("test_data_venues").

(deftest ^:parallel fake-sync-transformation-test
  (mt/test-driver :snowflake
    (testing "Snowflake fake-sync uses plain table names (not qualified)"
      ;; Snowflake has separate databases per dataset, so tables are just "users"
      ;; not "transform_test_users" like Redshift which shares a single database.
      (let [dbdef {:database-name "transform-test"
                   :table-definitions [{:table-name        "users"
                                        :field-definitions [{:field-name "name" :base-type :type/Text}]}]}
            rows  (@#'test.get-or-create/dbdef->fake-sync-rows :snowflake 123 dbdef)
            table (:table-row (first rows))]
        (is (= "users" (:name table)) "Should be plain name, not 'transform_test_users'")
        (is (= "PUBLIC" (:schema table)))))))
