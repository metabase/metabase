(ns metabase.driver.snowflake-test
  (:require [clojure
             [set :as set]
             [string :as str]
             [test :refer :all]]
            [metabase
             [driver :as driver]
             [models :refer [Table]]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.test.data
             [dataset-definitions :as dataset-defs]
             [sql :as sql.tx]]
            [metabase.test.data.sql.ddl :as ddl]))

;;
(deftest ddl-statements-test
  (testing "make sure we didn't break the code that is used to generate DDL statements when we add new test datasets"
    (testing "Create DB DDL statements"
      (is (= "DROP DATABASE IF EXISTS \"v2_test-data\"; CREATE DATABASE \"v2_test-data\";"
             (sql.tx/create-db-sql :snowflake (mt/get-dataset-definition dataset-defs/test-data)))))

    (testing "Create Table DDL statements"
      (is (= (map
              #(str/replace % #"\s+" " ")
              ["DROP TABLE IF EXISTS \"v2_test-data\".\"PUBLIC\".\"users\";"
               "CREATE TABLE \"v2_test-data\".\"PUBLIC\".\"users\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"last_login\" TIMESTAMP_LTZ, \"password\" TEXT, PRIMARY KEY (\"id\")) ;"
               "DROP TABLE IF EXISTS \"v2_test-data\".\"PUBLIC\".\"categories\";"
               "CREATE TABLE \"v2_test-data\".\"PUBLIC\".\"categories\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                PRIMARY KEY (\"id\")) ;"
               "DROP TABLE IF EXISTS \"v2_test-data\".\"PUBLIC\".\"venues\";"
               "CREATE TABLE \"v2_test-data\".\"PUBLIC\".\"venues\" (\"id\" INTEGER AUTOINCREMENT, \"name\" TEXT,
                \"category_id\" INTEGER, \"latitude\" FLOAT, \"longitude\" FLOAT, \"price\" INTEGER, PRIMARY KEY (\"id\")) ;"
               "DROP TABLE IF EXISTS \"v2_test-data\".\"PUBLIC\".\"checkins\";"
               "CREATE TABLE \"v2_test-data\".\"PUBLIC\".\"checkins\" (\"id\" INTEGER AUTOINCREMENT, \"date\" DATE,
                \"user_id\" INTEGER, \"venue_id\" INTEGER, PRIMARY KEY (\"id\")) ;"
               "ALTER TABLE \"v2_test-data\".\"PUBLIC\".\"venues\" ADD CONSTRAINT \"gory_id_categories_-1524018980\"
                FOREIGN KEY (\"category_id\") REFERENCES \"v2_test-data\".\"PUBLIC\".\"categories\" (\"id\");"
               "ALTER TABLE \"v2_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ckins_user_id_users_-230440067\"
                FOREIGN KEY (\"user_id\") REFERENCES \"v2_test-data\".\"PUBLIC\".\"users\" (\"id\");"
               "ALTER TABLE \"v2_test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"kins_venue_id_venues_621212269\"
                FOREIGN KEY (\"venue_id\") REFERENCES \"v2_test-data\".\"PUBLIC\".\"venues\" (\"id\");"])
             (ddl/create-db-ddl-statements :snowflake (-> (mt/get-dataset-definition dataset-defs/test-data)
                                                          (update :database-name #(str "v2_" %)))))))))

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

(deftest describe-table-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table uses the NAME FROM DETAILS too"
      (is (= {:name   "categories"
              :schema "PUBLIC"
              :fields #{{:name              "id"
                         :database-type     "NUMBER"
                         :base-type         :type/Number
                         :pk?               true
                         :database-position 0}
                        {:name              "name"
                         :database-type     "VARCHAR"
                         :base-type         :type/Text
                         :database-position 1}}}
             (driver/describe-table :snowflake (assoc (mt/db) :name "ABC") (Table (mt/id :categories))))))))

(deftest describe-table-fks-test
  (mt/test-driver :snowflake
    (testing "make sure describe-table-fks uses the NAME FROM DETAILS too"
      (is (= #{{:fk-column-name   "category_id"
                :dest-table       {:name "categories", :schema "PUBLIC"}
                :dest-column-name "id"}}
             (driver/describe-table-fks :snowflake (assoc (mt/db) :name "ABC") (Table (mt/id :venues))))))))

(deftest can-connect-test
  (mt/test-driver :snowflake
    (letfn [(can-connect? [details]
              (driver/can-connect? :snowflake details))]
      (is (= true
             (can-connect? (:details (mt/db))))
          "can-connect? should return true for normal Snowflake DB details")
      (is (= false
             (mt/suppress-output
               (can-connect? (assoc (:details (mt/db)) :db (mt/random-name)))))
          "can-connect? should return false for Snowflake databases that don't exist (#9041)"))))

(deftest report-timezone-test
  (mt/test-driver :snowflake
    (testing "Make sure temporal parameters are set and returned correctly when report-timezone is set (#11036)"
      (letfn [(run-query []
                (mt/rows
                  (qp/process-query
                    (merge
                     {:database   (mt/id)
                      :type       :native
                      :native     {:query         (str "SELECT {{filter_date}}")
                                   :template-tags {:filter_date {:name         "filter_date"
                                                                 :display_name "Just A Date"
                                                                 :type         "date"}}}
                      :parameters [{:type   "date/single"
                                    :target ["variable" ["template-tag" "filter_date"]]
                                    :value  "2014-08-02"}]}))))]
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
                    (merge
                     {:database   (mt/id)
                      :type       :native
                      :native     {:query         (str "SELECT {{filter_date}}, \"last_login\" "
                                                       "FROM \"v2_test-data\".\"PUBLIC\".\"users\" "
                                                       "WHERE date_trunc('day', CAST(\"last_login\" AS timestamp))"
                                                       "    = date_trunc('day', CAST({{filter_date}} AS timestamp))")
                                   :template-tags {:filter_date {:name         "filter_date"
                                                                 :display_name "Just A Date"
                                                                 :type         "date"}}}
                      :parameters [{:type   "date/single"
                                    :target ["variable" ["template-tag" "filter_date"]]
                                    :value  "2014-08-02"}]}))))]
        (testing "baseline (no report-timezone set)"
          (is (= [["2014-08-02T00:00:00Z" "2014-08-02T12:30:00Z"]
                  ["2014-08-02T00:00:00Z" "2014-08-02T09:30:00Z"]]
                 (run-query))))
        (testing "with report timezone set"
          (is (= [["2014-08-02T00:00:00-07:00" "2014-08-02T05:30:00-07:00"]
                  ["2014-08-02T00:00:00-07:00" "2014-08-02T02:30:00-07:00"]]
                 (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
                   (run-query)))))))))
