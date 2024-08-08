(ns metabase.driver.snowflake-test
  (:require
   [clojure.data.json :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.snowflake :as driver.snowflake]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models :refer [Table]]
   [metabase.models.database :refer [Database]]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.snowflake :as test.data.snowflake]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- query->native [query]
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

(deftest sanity-check-test
  (mt/test-driver :snowflake
    (is (= [100]
           (mt/first-row
            (mt/run-mbql-query venues
              {:aggregation [[:count]]}))))))

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
                 :quote-db-name false
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
    (testing "Database name is quoted if quoting is requested (#27856)"
      (are [quote? result] (=? {:db result}
                               (let [details (assoc details :quote-db-name quote?)]
                                 (sql-jdbc.conn/connection-details->spec :snowflake details)))
        true "\"v3_sample-dataset\""
        false "v3_sample-dataset"))
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
        false "snowflake.example.com" "//ls10467.us-east-2.aws.snowflakecomputing.com/"))))

(deftest ^:parallel ddl-statements-test
  (testing "make sure we didn't break the code that is used to generate DDL statements when we add new test datasets"
    (binding [test.data.snowflake/*database-prefix-fn* (constantly "v4_")]
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
        (is (= ["SELECT TRUE AS \"_\" FROM \"dbname\".\"PUBLIC\".\"table\" WHERE 1 <> 1 LIMIT 0"]
               (sql-jdbc.describe-database/simple-select-probe-query :snowflake "PUBLIC" "table")))))))

(deftest ^:parallel have-select-privilege?-test
  (mt/test-driver :snowflake
    (qp.store/with-metadata-provider (mt/id)
      (sql-jdbc.execute/do-with-connection-with-options
       :snowflake
       (mt/db)
       nil
       (fn [^java.sql.Connection conn]
         (is (sql-jdbc.sync/have-select-privilege? :snowflake conn "PUBLIC" "venues")))))))

(deftest describe-database-test
  (mt/test-driver :snowflake
    (testing "describe-database"
      (let [expected {:tables
                      #{{:name "users",      :schema "PUBLIC", :description nil}
                        {:name "venues",     :schema "PUBLIC", :description nil}
                        {:name "checkins",   :schema "PUBLIC", :description nil}
                        {:name "categories", :schema "PUBLIC", :description nil}
                        {:name "orders",     :schema "PUBLIC", :description nil}
                        {:name "people",     :schema "PUBLIC", :description nil}
                        {:name "products",   :schema "PUBLIC", :description nil}
                        {:name "reviews",    :schema "PUBLIC", :description nil}}}]
        (testing "should work with normal details"
          (is (= expected
                 (driver/describe-database :snowflake (mt/db)))))
        (testing "should accept either `:db` or `:dbname` in the details, working around a bug with the original impl"
          (is (= expected
                 (driver/describe-database :snowflake (update (mt/db) :details set/rename-keys {:db :dbname})))))
        (testing "should throw an Exception if details have neither `:db` nor `:dbname`"
          (is (thrown? Exception
                       (driver/describe-database :snowflake (update (mt/db) :details set/rename-keys {:db :xyz})))))
        (testing "should use the NAME FROM DETAILS instead of the DB DISPLAY NAME to fetch metadata (#8864)"
          (is (= expected
                 (driver/describe-database :snowflake (assoc (mt/db) :name "ABC")))))))))

(deftest describe-database-default-schema-test
  (testing "describe-database should include Tables from all schemas even if the DB has a default schema (#38135)"
    (mt/test-driver :snowflake
      (let [details     (assoc (mt/dbdef->connection-details :snowflake :db {:database-name "Default-Schema-Test"})
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
        (t2.with-temp/with-temp [Database database {:engine :snowflake, :details details}]
          (is (=? {:tables #{{:name table-name, :schema schema-name, :description nil}}}
                  (driver/describe-database :snowflake database))))))))

(deftest describe-database-views-test
  (mt/test-driver :snowflake
    (testing "describe-database views"
      (let [details (mt/dbdef->connection-details :snowflake :db {:database-name "views_test"})
            db-name (:db details)
            spec    (sql-jdbc.conn/connection-details->spec :snowflake details)]
        ;; create the snowflake DB
        (doseq [stmt [(format "DROP DATABASE IF EXISTS \"%s\";" db-name)
                      (format "CREATE DATABASE \"%s\";" db-name)]]
          (jdbc/execute! spec [stmt] {:transaction? false}))
        ;; create the DB object
        (t2.with-temp/with-temp [Database database {:engine :snowflake, :details details}]
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
                        (t2/select [Table :name] :db_id (u/the-id database)))))))))))

(def dynamic-db
  (mt/dataset-definition "dynamic-db"
    ["metabase_users"
     [{:field-name "name" :base-type :type/Text}]
     [["mb_qnkhuat"]]]))

(defn- do-with-dynamic-table
  [thunk]
  (mt/dataset (mt/dataset-definition "dynamic-db"
                ["metabase_users"
                 [{:field-name "name" :base-type :type/Text}]
                 [["mb_qnkhuat"]]])
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

(deftest ^:parallel describe-table-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table uses the NAME FROM DETAILS too"
      (is (= {:name   "categories"
              :schema "PUBLIC"
              :fields #{{:name              "id"
                         :database-type     "NUMBER"
                         :base-type         :type/Number
                         :pk?               true
                         :database-position 0
                         :database-is-auto-increment true
                         :database-required false
                         :json-unfolding    false}
                        {:name              "name"
                         :database-type     "VARCHAR"
                         :base-type         :type/Text
                         :database-position 1
                         :database-is-auto-increment false
                         :database-required true
                         :json-unfolding    false}}}
             (driver/describe-table :snowflake (assoc (mt/db) :name "ABC") (t2/select-one Table :id (mt/id :categories))))))))

(deftest ^:parallel describe-table-fks-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table-fks uses the NAME FROM DETAILS too"
      (is (= #{{:fk-column-name   "category_id"
                :dest-table       {:name "categories", :schema "PUBLIC"}
                :dest-column-name "id"}}
             #_{:clj-kondo/ignore [:deprecated-var]}
             (driver/describe-table-fks :snowflake (assoc (mt/db) :name "ABC") (t2/select-one Table :id (mt/id :venues))))))))

(defn- format-env-key ^String [env-key]
  (let [[_ header body footer]
        (re-find #"(?s)(-----BEGIN (?:\p{Alnum}+ )?PRIVATE KEY-----)(.*)(-----END (?:\p{Alnum}+ )?PRIVATE KEY-----)" env-key)]
    (str header (str/replace body #"\s+|\\n" "\n") footer)))

(deftest can-connect-test
  (let [pk-key (format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
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

        (when (and pk-key pk-user)
          (mt/with-temp-file [pk-path]
            (testing "private key authentication"
              (spit pk-path pk-key)
              (doseq [to-merge [{:private-key-value pk-key} ;; uploaded string
                                {:private-key-value (.getBytes pk-key "UTF-8")} ;; uploaded byte array
                                {:private-key-path pk-path}]] ;; local file path
                (let [details (-> (:details (mt/db))
                                  (dissoc :password)
                                  (merge {:db pk-db :user pk-user} to-merge))]
                  (is (can-connect? details)))))))))))

(deftest ^:synchronized pk-auth-custom-role-e2e-test
  (mt/test-driver
   :snowflake
   (let [account           (tx/db-test-env-var-or-throw :snowflake :account)
         warehouse         (tx/db-test-env-var-or-throw :snowflake :warehouse)
         ;; User with default role PULIC. To access the db custom role has to be used.
         user              (tx/db-test-env-var-or-throw :snowflake :rsa-role-test-custom-user)
         private-key-value (format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
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
                                      :private-key-value   (str "data:application/octet-stream;base64,"
                                                                (u/encode-base64 private-key-value))
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
         private-key-value (format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))
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
                                      :private-key-value   (str "data:application/octet-stream;base64,"
                                                                (u/encode-base64 private-key-value))
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
                   :native     {:query         (str "SELECT {{filter_date}}")
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
                                                    (format "FROM \"%stest-data\".\"PUBLIC\".\"users\" "
                                                            (test.data.snowflake/*database-prefix-fn*))
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

(deftest ^:parallel zoned-date-time-parameter-test
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
                                        :native     {:query         (str "SELECT DAYOFWEEK({{filter_date}})")
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
      (t2.with-temp/with-temp [Database db {:name    "Legacy Snowflake DB"
                                            :engine  :snowflake,
                                            :details {:account  "my-instance"
                                                      :regionid "us-west-1"}}]
        (is (= {:account "my-instance.us-west-1"}
               (:details db)))))))

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
                          "serverId" (public-settings/site-uuid)
                          "client" "Metabase"
                          "queryHash" "cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2"
                          "queryType" "query"
                          "cardId" 1234
                          "dashboardId" 5678
                          "context" "ad-hoc"
                          "userId" 1000
                          "databaseId" (mt/id)}
            result-query (driver/prettify-native-form :snowflake
                           (query->native
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
            result-map (json/read-str result-comment)]
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
        (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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

(deftest ^:parallel filter-on-variant-column-test
  (testing "We should still let you do various filter types on VARIANT (anything) columns (#45206)"
    (mt/test-driver :snowflake
      (let [variant-base-type (sql-jdbc.sync/database-type->base-type :snowflake :VARIANT)
            metadata-provider (lib.tu/merged-mock-metadata-provider
                               (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
