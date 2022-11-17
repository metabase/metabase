(ns metabase.driver.snowflake-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models :refer [Table]]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u]
            [toucan.db :as db]))

(deftest ^:parallel ddl-statements-test
  (testing "make sure we didn't break the code that is used to generate DDL statements when we add new test datasets"
    (testing "Create DB DDL statements"
      (is (= "DROP DATABASE IF EXISTS \"v3_test-data\"; CREATE DATABASE \"v3_test-data\";"
             (sql.tx/create-db-sql :snowflake (mt/get-dataset-definition defs/test-data)))))

    (testing "Create Table DDL statements"
      (is (= (map
              #(str/replace % #"\s+" " ")
              ["DROP TABLE IF EXISTS \"v3_test-data\".\"PUBLIC\".\"users\";"
               "CREATE TABLE \"v3_test-data\".\"PUBLIC\".\"users\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"last_login\" TIMESTAMP_LTZ, \"password\" TEXT, PRIMARY KEY (\"id\")) ;"
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
                                                                 (update :database-name #(str "v3_" %)))))))))

;; TODO -- disabled because these are randomly failing, will figure out when I'm back from vacation. I think it's a
;; bug in the JDBC driver -- Cam
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
        (mt/with-temp Database [database {:engine :snowflake, :details (assoc details :db "views_test")}]
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
                        (db/select [Table :name] :db_id (u/the-id database)))))))))))

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
                         :database-required false}
                        {:name              "name"
                         :database-type     "VARCHAR"
                         :base-type         :type/Text
                         :database-position 1
                         :database-required false}}}
             (driver/describe-table :snowflake (assoc (mt/db) :name "ABC") (db/select-one Table :id (mt/id :categories))))))))

(deftest describe-table-fks-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table-fks uses the NAME FROM DETAILS too"
      (is (= #{{:fk-column-name   "category_id"
                :dest-table       {:name "categories", :schema "PUBLIC"}
                :dest-column-name "id"}}
             (driver/describe-table-fks :snowflake (assoc (mt/db) :name "ABC") (db/select-one Table :id (mt/id :venues))))))))

(defn- format-env-key [env-key]
  (let [[_ header body footer]
        (re-find #"(-----BEGIN (?:\p{Alnum}+ )?PRIVATE KEY-----)(.*)(-----END (?:\p{Alnum}+ )?PRIVATE KEY-----)" env-key)]
    (str header (str/replace body #"\s+" "\n") footer)))

(deftest can-connect-test
  (mt/test-driver :snowflake
    (let [can-connect? (partial driver/can-connect? :snowflake)]
      (is (= true
             (can-connect? (:details (mt/db))))
          "can-connect? should return true for normal Snowflake DB details")
      (is (thrown?
           net.snowflake.client.jdbc.SnowflakeSQLException
           (can-connect? (assoc (:details (mt/db)) :db (mt/random-name))))
          "can-connect? should throw for Snowflake databases that don't exist (#9511)")
      (let [pk-user (tx/db-test-env-var-or-throw :snowflake :pk-user)
            pk-key  (format-env-key (tx/db-test-env-var-or-throw :snowflake :pk-private-key))]
        (is (= true
               (-> (:details (mt/db))
                   (dissoc :password)
                   (assoc :user pk-user
                          :private-key-value pk-key)
                   can-connect?))
            "can-connect? should return true when authenticating with private key")))))

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
                                                    "FROM \"v3_test-data\".\"PUBLIC\".\"users\" "
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
          (is (= [["2014-08-02T00:00:00-07:00" "2014-08-02T05:30:00-07:00"]
                  ["2014-08-02T00:00:00-07:00" "2014-08-02T02:30:00-07:00"]]
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
      (mt/with-temp Database [db {:name    "Legacy Snowflake DB"
                                  :engine  :snowflake,
                                  :details {:account  "my-instance"
                                            :regionid "us-west-1"}}]
                             (is (= {:account "my-instance.us-west-1"}
                                    (:details db)))))))

(def ^:private test-public-key
  "n.b. this has had lines like ^--.*--$ and newlines stripped."
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0UNAZzlbi0Kx9758Mc03HjNmVqYuGD+8eEvaEY59jvkc+LDQEZY8Jg2IN67K5bwXOCgBpQ6vBrUHQujy4lnFmelKmcMpqEPQnpmn5dyS/kQDTzqjSZnE7yDuHUQgE8dn2atkFhcFaDgvkBjIvRXGS4AyRvhy8jAdNEhIGRqQo+5B2wANpqcakHwmfifmEhMYXd1uE8tzuVFLcL/dOhjm1kM/eSwzETD90pB+L16FFcvSYfJ91/jnFKADpCg6/vUBLz+tHHGOKXce5vwRXURb/CENr1J1J5TsOLOTeaw9PlMy5CTYsuLDNTbWGWLd8ne8pG2CG+wB2woSRyAgJuyr5QIDAQAB")

(def ^:private test-private-key
  "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDRQ0BnOVuLQrH3\nvnwxzTceM2ZWpi4YP7x4S9oRjn2O+Rz4sNARljwmDYg3rsrlvBc4KAGlDq8GtQdC\n6PLiWcWZ6UqZwymoQ9Cemafl3JL+RANPOqNJmcTvIO4dRCATx2fZq2QWFwVoOC+Q\nGMi9FcZLgDJG+HLyMB00SEgZGpCj7kHbAA2mpxqQfCZ+J+YSExhd3W4Ty3O5UUtw\nv906GObWQz95LDMRMP3SkH4vXoUVy9Jh8n3X+OcUoAOkKDr+9QEvP60ccY4pdx7m\n/BFdRFv8IQ2vUnUnlOw4s5N5rD0+UzLkJNiy4sM1NtYZYt3yd7ykbYIb7AHbChJH\nICAm7KvlAgMBAAECggEAGczA0/kuYC0I5BKIHVu/v+l2ZJh4dmTlR6+SYze+IzJz\nb/XcsU5kfAyPDs5uFYTrF/FWwpLc4WbQTl+KEn4e7qrkl7CIIka6IdOv75cSSGb6\nQXppR1m9/f2BXfpYOhgLpbqLzG1qLT9AHfPwS9+zYvubN0TKZzGnaBrBSNcNnig4\nfAJIWXDu3qlJiTtJFDTAsVxJDVSzMem2TwWg5E0MsRhBZRDMm+SCJ4GMMQcEHbGy\nVJvX2HlHLO8GsNT0czo1V4spaykg9iS7W+eJP+ERYOl68n8Lr6r0CWywMGKrExux\nSXahblIRBcVVByvi7pAfbujptSkOtWL89YX2FDXiAQKBgQD/jyi3LlkQsH2MWwLo\n5+7Hid2QeQqS5O7WzNMNzPiU5oC9sBFwSbVtzZto/cH028ke2sAfBeEx6TZ5BAXT\nAZZcs6pN0CluOcd9eGcvDK3u1uvkQJScK39PRnsDRICN5isxNQx7DAA0wNY2l7qL\nHmFItlITn7nYRVsRyUm+DF4O2QKBgQDRn6aIyqP0Fv3V4BOuGXtaRCB8ed/Iy1ua\n4+1R5lkQme6H9B/G8II27QOqqCG5I4V9FjWGOXiK5cQq0fOZ6qfgPrxgHIyu6e3v\neqf77u4V4/n7besFoqd94nuuNZZIwud8tGuqCqO3xkyCuOJM69ERG/kxtumMfEiH\nEME7QTY17QKBgEdUOdUHBqz11dT7AhDny2m+PS05242sgE1L1gygDTHiNES9g+CH\ncjA3lwzy5tPlFHmcLMt75KL9qMqWKNoAM2ukagBV/XpafiezF3m2XEWxjx2iONht\n+5aw4VzEHe19NMkDOXyOmPAgcqnCJ7r0u8qDuNzpVAHdOdH5ELAO26HhAoGBAIvP\nDUVi0eL0iqvg3X9ao3jaw0gCCQ1lBF3T8u6S0YhPAlZOrfsDYfW8MpvZs1RFqrx4\n2Y4COrF4+VMN4IkhhoH7lawMno/yma0Fg5B2FPkoqgvVjdCeYVOGgLL6Lpes1rPH\nqZ8ppXPmoBT3todTKIdevt83faEjK0RaGmao4b0pAoGBAKPVn2y6sJcfvWkWeCpC\n+S57MZLA6kLKFX8yLAc0ZGWDZERWX9F4v098WyO1hqMuV3i25/1jSWKfN/fqiigZ\nOO5Z9Sl0QuYYWB/pbzM/1Os+NrZzjzfwuyrIBO/5AXgzpsHDKX72/PCdQWyrU3qL\nIhnZGKdWT7f/t/LdqtFcn6a4\n-----END PRIVATE KEY-----\n")

(deftest keypair-auth-test
  (mt/test-driver :snowflake
    (testing "Should be able to connect as a user with an unencrypted keypair"
      (let [{:keys [user] :as details} (mt/dbdef->connection-details :snowflake :db {:database-name "v3_snowflake_sample_data"})
            spec    (sql-jdbc.conn/connection-details->spec :snowflake details)]
        (is (= {:can_connect 1} (first (jdbc/query spec "select 1 as can_connect")))
            "Could not connect to snowflake.")

        (is (= [{:status "Statement executed successfully."}]
               (jdbc/with-db-transaction [db spec]
                 (jdbc/query db "use role ACCOUNTADMIN;")
                 (jdbc/query db (str "ALTER USER " user " SET rsa_public_key = '" test-public-key "';"))))
            "Could not set public key.")

        (is (= false
               (try (driver/can-connect? :snowflake
                                         (assoc details
                                                :password nil
                                                :private-key-value test-private-key))
                    (catch Exception _ false))))

        (is (= true
               (driver/can-connect? :snowflake
                                    (assoc details
                                           :password nil
                                           :private-key-value test-private-key
                                           ;; Needs to be a db that user has access to.
                                           :db "SNOWFLAKE_SAMPLE_DATA"))))


        (is (= [{:status "Statement executed successfully."}]
               (jdbc/with-db-transaction [db spec]
                 (jdbc/query db "use role ACCOUNTADMIN;")
                 (jdbc/query db (str "ALTER USER " user " SET rsa_public_key = null;")))))

        (is (= [{:property "RSA_PUBLIC_KEY"
                 :description "RSA public key of the user"
                 :value "null"
                 :default "null"}]
               (filter #(= "RSA_PUBLIC_KEY" (:property %))
                       (jdbc/query spec (str "DESCRIBE USER SNOWFLAKE_DEVELOPER"))))
            "rsa key not cleared.")))))

#_(deftest keypair-auth-test
  (mt/test-driver :snowflake
    (testing "Should be able to connect as a user with an unencrypted keypair"
      (let [admin-details (mt/dbdef->connection-details :snowflake :db
                                                        {:database-name "SNOWFLAKE_SAMPLE_DATA"})
            admin-spec    (sql-jdbc.conn/connection-details->spec :snowflake admin-details)
            _ (do (def admin-details admin-details) (def admin-spec admin-spec))
            user "OWL_USER"
            user-details (-> (mt/dbdef->connection-details :snowflake :db
                                                           {:database-name "SNOWFLAKE_SAMPLE_DATA"})
                             (assoc :password nil
                                    :user user
                                    :private-key-value private-key
                                    :private-key-options "local"))
            _ (def ud user-details)
            user-spec (sql-jdbc.conn/connection-details->spec :snowflake user-details)]
        (is (= {:can_connect 1} (first (jdbc/query admin-spec "select 1 as can_connect")))
            "Could not connect to snowflake.")
        (is (= [{:status "Statement executed successfully."}]
               (jdbc/query admin-spec "use role DEVELOPER;")
               (jdbc/query admin-spec (str "CREATE USER " user ";"))
               (jdbc/query admin-spec (str "ALTER USER " user " SET rsa_public_key = '" public-key "';"))
               (jdbc/query admin-spec (str "GRANT ROLE DEVELOPER TO USER " user ";"))
               (jdbc/query admin-spec (str "DESCRIBE USER " user ";")))
            "Could not create OWL_USER for snowflake.")

        (jdbc/query admin-spec (str "DESCRIBE USER " user ";"))


        #_{:warehouse "COMPUTE_WH",
           :db "SNOWFLAKE_SAMPLE_DATA",
           :role nil,
           :private-key-path nil,
           :password nil,
           :private-key-options "local",
           :private-key-source nil,
           :advanced-options false,
           :private-key-id 1,
           :schema-filters-type "all",
           :account "ls10467.us-east-2.aws",
           :tunnel-enabled false,
           :engine :snowflake,
           :private_key_file "/var/folders/dw/_2dd8rzs1_1dvtbbt2tdsxy80000gn/T/metabase-secret_14685192043934707478.tmp",
           :private-key-creator-id 4,
           :connection-uri
           "jdbc:snowflake://ls10467.us-east-2.aws.snowflakecomputing.com?user=BRYAN&private_key_file=/var/folders/dw/_2dd8rzs1_1dvtbbt2tdsxy80000gn/T/metabase-secret_14685192043934707478.tmp",
           :user "BRYAN",
           :private-key-created-at "2022-11-14T23:38:18.208281Z"}

        (jdbc/query {:warehouse "COMPUTE_WH",
                     :db "SNOWFLAKE_SAMPLE_DATA",
                     :password nil,
                     :account "ls10467.us-east-2.aws",
                     :private_key_file "/var/folders/dw/_2dd8rzs1_1dvtbbt2tdsxy80000gn/T/metabase-secret_14685192043934707478.tmp",
                     :connection-uri "jdbc:snowflake://ls10467.us-east-2.aws.snowflakecomputing.com?user=OWL_USER&private_key_file=/var/folders/dw/_2dd8rzs1_1dvtbbt2tdsxy80000gn/T/metabase-secret_14685192043934707478.tmp",
                     :user "OWL_USER"} ["select 1"])

        #_(is (= "?" (jdbc/query user-spec ["SHOW TABLES;"])))

        (is (= [{:status "Statement executed successfully."}]
               (jdbc/query admin-spec
                           ["use role DEVELOPER;"
                            (str "DROP USER " user ";")])))))))

;; (def user "OWL_USER")
;; (def deats details)
;; (def spec admin-specn-spec)
