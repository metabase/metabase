(ns metabase.driver.snowflake-test
  (:require
   [clojure.data.json :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models :refer [Table]]
   [metabase.models.database :refer [Database]]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.snowflake :as test.data.snowflake]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   #_{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx]
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
                      (binding [sync-util/*log-exceptions-and-continue?* false
                                hx/*honey-sql-version*                   2]
                        (thunk))))

(deftest sanity-check-test
  (mt/test-driver :snowflake
    (is (= [100]
           (mt/first-row
            (mt/run-mbql-query venues
              {:aggregation [[:count]]}))))))

(deftest ^:parallel ddl-statements-test
  (testing "make sure we didn't break the code that is used to generate DDL statements when we add new test datasets"
    (binding [test.data.snowflake/*database-prefix-fn* (constantly "v3_")]
      (testing "Create DB DDL statements"
        (is (= "DROP DATABASE IF EXISTS \"v3_test-data\"; CREATE DATABASE \"v3_test-data\";"
               (sql.tx/create-db-sql :snowflake (mt/get-dataset-definition defs/test-data)))))

      (testing "Create Table DDL statements"
        (is (= (map
                #(str/replace % #"\s+" " ")
                ["DROP TABLE IF EXISTS \"v3_test-data\".\"PUBLIC\".\"users\";"
                 "CREATE TABLE \"v3_test-data\".\"PUBLIC\".\"users\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"last_login\" TIMESTAMP_NTZ, \"password\" TEXT, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v3_test-data\".\"PUBLIC\".\"categories\";"
                 "CREATE TABLE \"v3_test-data\".\"PUBLIC\".\"categories\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT NOT NULL,
                PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v3_test-data\".\"PUBLIC\".\"venues\";"
                 "CREATE TABLE \"v3_test-data\".\"PUBLIC\".\"venues\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"category_id\" INTEGER, \"latitude\" FLOAT, \"longitude\" FLOAT, \"price\" INTEGER, PRIMARY KEY (\"id\")) ;"
                 "DROP TABLE IF EXISTS \"v3_test-data\".\"PUBLIC\".\"checkins\";"
                 "CREATE TABLE \"v3_test-data\".\"PUBLIC\".\"checkins\" (\"id\" INTEGER AUTOINCREMENT, \"date\" DATE,
                \"user_id\" INTEGER, \"venue_id\" INTEGER, PRIMARY KEY (\"id\")) ;"
                 "ALTER TABLE \"v3_test-data\".\"PUBLIC\".\"venues\" ADD CONSTRAINT \"egory_id_categories_-740504465\"
                FOREIGN KEY (\"category_id\") REFERENCES \"v3_test-data\".\"PUBLIC\".\"categories\" (\"id\");"
                 "ALTER TABLE \"v3_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ckins_user_id_users_1638713823\"
                FOREIGN KEY (\"user_id\") REFERENCES \"v3_test-data\".\"PUBLIC\".\"users\" (\"id\");"
                 "ALTER TABLE \"v3_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ins_venue_id_venues_-833167948\"
                FOREIGN KEY (\"venue_id\") REFERENCES \"v3_test-data\".\"PUBLIC\".\"venues\" (\"id\");"])
               (ddl/create-db-tables-ddl-statements :snowflake (-> (mt/get-dataset-definition defs/test-data)
                                                                   (update :database-name #(str "v3_" %))))))))))

(deftest describe-database-test
  (mt/test-driver :snowflake
    (testing "describe-database"
      (let [expected {:tables
                      #{{:name "users",      :schema "PUBLIC", :description nil}
                        {:name "venues",     :schema "PUBLIC", :description nil}
                        {:name "checkins",   :schema "PUBLIC", :description nil}
                        {:name "categories", :schema "PUBLIC", :description nil}}}]
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

(deftest describe-database-views-test
  (mt/test-driver :snowflake
    (testing "describe-database views"
      (let [details (mt/dbdef->connection-details :snowflake :db {:database-name "views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :snowflake details)]
        ;; create the snowflake DB
        (jdbc/execute! spec ["DROP DATABASE IF EXISTS \"views_test\";"]
                       {:transaction? false})
        (jdbc/execute! spec ["CREATE DATABASE \"views_test\";"]
                       {:transaction? false})
        ;; create the DB object
        (t2.with-temp/with-temp [Database database {:engine :snowflake, :details (assoc details :db "views_test")}]
          (let [sync! #(sync/sync-database! database)]
            ;; create a view
            (doseq [statement ["CREATE VIEW \"views_test\".\"PUBLIC\".\"example_view\" AS SELECT 'hello world' AS \"name\";"
                               "GRANT SELECT ON \"views_test\".\"PUBLIC\".\"example_view\" TO PUBLIC;"]]
              (jdbc/execute! spec [statement]))
            ;; now sync the DB
            (sync!)
            ;; now take a look at the Tables in the database, there should be an entry for the view
            (is (= [{:name "example_view"}]
                   (map (partial into {})
                        (t2/select [Table :name] :db_id (u/the-id database)))))))))))

(deftest sync-dynamic-tables-test
  (testing "Should be able to sync dynamic tables"
    (mt/test-driver :snowflake
      (mt/dataset (mt/dataset-definition "dynamic-table"
                    ["metabase_users"
                     [{:field-name "name" :base-type :type/Text}]
                     [["mb_qnkhuat"]]])
        (let [db-id   (:id (mt/db))
              details (:details (mt/db))
              spec    (sql-jdbc.conn/connection-details->spec driver/*driver* details)]
          (jdbc/execute! spec [(format "CREATE OR REPLACE DYNAMIC TABLE \"%s\".\"PUBLIC\".\"metabase_fan\" target_lag = '1 minute' warehouse = 'COMPUTE_WH' AS
                                       SELECT * FROM \"%s\".\"PUBLIC\".\"metabase_users\" WHERE \"%s\".\"PUBLIC\".\"metabase_users\".\"name\" LIKE 'MB_%%';"
                                       (:db details) (:db details) (:db details))])
          (sync/sync-database! (t2/select-one :model/Database db-id))
          (testing "both base tables and dynamic tables should be synced"
            (is (= #{"metabase_fan" "metabase_users"}
                   (t2/select-fn-set :name :model/Table :db_id db-id)))
            (testing "the fields for dynamic tables are synced correctly"
              (is (= #{{:name "name" :base_type :type/Text}
                       {:name "id" :base_type :type/Number}}
                     (set (t2/select [:model/Field :name :base_type]
                                     :table_id (t2/select-one-pk :model/Table :name "metabase_fan" :db_id db-id))))))))))))

(deftest describe-table-test
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

(deftest describe-table-fks-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table-fks uses the NAME FROM DETAILS too"
      (is (= #{{:fk-column-name   "category_id"
                :dest-table       {:name "categories", :schema "PUBLIC"}
                :dest-column-name "id"}}
             (driver/describe-table-fks :snowflake (assoc (mt/db) :name "ABC") (t2/select-one Table :id (mt/id :venues))))))))

(defn- format-env-key ^String [env-key]
  (let [[_ header body footer]
        (re-find #"(-----BEGIN (?:\p{Alnum}+ )?PRIVATE KEY-----)(.*)(-----END (?:\p{Alnum}+ )?PRIVATE KEY-----)" env-key)]
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

(deftest report-timezone-test
  (mt/test-driver :snowflake
    (testing "Make sure temporal parameters are set and returned correctly when report-timezone is set (#11036)"
      (letfn [(run-query []
                (mt/rows
                 (qp/process-query
                  {:database   (mt/id)
                   :type       :native
                   :native     {:query         (str "SELECT {{filter_date}}")
                                :template-tags {:filter_date {:name         "filter_date"
                                                              :display_name "Just A Date"
                                                              :type         "date"}}}
                   :parameters [{:type   "date/single"
                                 :target ["variable" ["template-tag" "filter_date"]]
                                 :value  "2014-08-02"}]})))]
        (testing "baseline"
          (is (= [["2014-08-02T00:00:00Z"]]
                 (run-query))))
        (testing "with report-timezone"
          (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
            (is (= [["2014-08-02T00:00:00-07:00"]]
                   (run-query)))))))
    (testing "Make sure temporal values are returned correctly when report-timezone is set (#11036)"
      (letfn [(run-query []
                (mt/rows
                 (qp/process-query
                  {:database   (mt/id)
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
                                 :value  "2014-08-02"}]})))]
        (testing "baseline (no report-timezone set)"
          (is (= [["2014-08-02T00:00:00Z" "2014-08-02T12:30:00Z"]
                  ["2014-08-02T00:00:00Z" "2014-08-02T09:30:00Z"]]
                 (run-query))))
        (testing "with report timezone set"
          (is (= [["2014-08-02T00:00:00-07:00" "2014-08-02T12:30:00-07:00"]
                  ["2014-08-02T00:00:00-07:00" "2014-08-02T09:30:00-07:00"]]
                 (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
                   (run-query)))))))))

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
      (mt/dataset sample-dataset
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

(deftest normalize-test
  (mt/test-driver :snowflake
    (testing "details should be normalized coming out of the DB"
      (t2.with-temp/with-temp [Database db {:name    "Legacy Snowflake DB"
                                            :engine  :snowflake,
                                            :details {:account  "my-instance"
                                                      :regionid "us-west-1"}}]
        (is (= {:account "my-instance.us-west-1"}
               (:details db)))))))

(deftest set-role-statement-test
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
