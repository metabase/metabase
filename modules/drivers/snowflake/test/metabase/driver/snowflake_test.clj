(ns metabase.driver.snowflake-test
  (:require [clojure
             [set :as set]
             [string :as str]
             [test :refer :all]]
            [metabase.driver :as driver]
            [metabase.models.table :refer [Table]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as dataset-defs]
             [datasets :as datasets :refer [expect-with-driver]]
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.test.data.sql.ddl :as ddl]))

;; make sure we didn't break the code that is used to generate DDL statements when we add new test datasets
(deftest ddl-statements-test
  (is (= "DROP DATABASE IF EXISTS \"test-data\"; CREATE DATABASE \"test-data\";"
         (sql.tx/create-db-sql :snowflake (tx/get-dataset-definition dataset-defs/test-data))))
  (is (= (map
          #(str/replace % #"\s+" " ")
          ["DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"users\";"
           "CREATE TABLE \"test-data\".\"PUBLIC\".\"users\" (\"name\" TEXT, \"last_login\" TIMESTAMP_LTZ, \"password\"
           TEXT, \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;"
           "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"categories\";"
           "CREATE TABLE \"test-data\".\"PUBLIC\".\"categories\" (\"name\" TEXT, \"id\" INTEGER AUTOINCREMENT, PRIMARY
           KEY (\"id\")) ;"
           "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"venues\";"
           "CREATE TABLE \"test-data\".\"PUBLIC\".\"venues\" (\"name\" TEXT, \"latitude\" FLOAT, \"longitude\" FLOAT,
           \"price\" INTEGER, \"category_id\" INTEGER, \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;"
           "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"checkins\";"
           "CREATE TABLE \"test-data\".\"PUBLIC\".\"checkins\" (\"user_id\" INTEGER, \"venue_id\" INTEGER, \"date\"
           DATE, \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;"
           "ALTER TABLE \"test-data\".\"PUBLIC\".\"venues\" ADD CONSTRAINT \"tegory_id_categories_927642602\" FOREIGN
           KEY (\"category_id\") REFERENCES \"test-data\".\"PUBLIC\".\"categories\" (\"id\");"
           "ALTER TABLE \"test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ckins_user_id_users_-815717481\"
           FOREIGN KEY (\"user_id\") REFERENCES \"test-data\".\"PUBLIC\".\"users\" (\"id\");"
           "ALTER TABLE \"test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"ns_venue_id_venues_-1854903846\"
           FOREIGN KEY (\"venue_id\") REFERENCES \"test-data\".\"PUBLIC\".\"venues\" (\"id\");"])
         (ddl/create-db-ddl-statements :snowflake (tx/get-dataset-definition dataset-defs/test-data)))))

(expect-with-driver :snowflake
  "UTC"
  (tu/db-timezone-id))

;; does describe-database (etc) use the NAME FROM DETAILS instead of the DB DISPLAY NAME to fetch metadata? (#8864)
(expect-with-driver :snowflake
  {:tables
   #{{:name "users",      :schema "PUBLIC", :description nil}
     {:name "venues",     :schema "PUBLIC", :description nil}
     {:name "checkins",   :schema "PUBLIC", :description nil}
     {:name "categories", :schema "PUBLIC", :description nil}}}
  (driver/describe-database :snowflake (assoc (data/db) :name "ABC")))

;; make sure describe-table uses the NAME FROM DETAILS too
(expect-with-driver :snowflake
  {:name   "categories"
   :schema "PUBLIC"
   :fields #{{:name          "id"
              :database-type "NUMBER"
              :base-type     :type/Number
              :pk?           true}
             {:name "name", :database-type "VARCHAR", :base-type :type/Text}}}
  (driver/describe-table :snowflake (assoc (data/db) :name "ABC") (Table (data/id :categories))))

;; make sure describe-table-fks uses the NAME FROM DETAILS too
(expect-with-driver :snowflake
  #{{:fk-column-name   "category_id"
     :dest-table       {:name "categories", :schema "PUBLIC"}
     :dest-column-name "id"}}
  (driver/describe-table-fks :snowflake (assoc (data/db) :name "ABC") (Table (data/id :venues))))

;; describe-database (etc) should accept either `:db` or `:dbname` in the details, working around a bug with the
;; original Snowflake impl
(expect-with-driver :snowflake
  {:tables
   #{{:name "users",      :schema "PUBLIC", :description nil}
     {:name "venues",     :schema "PUBLIC", :description nil}
     {:name "checkins",   :schema "PUBLIC", :description nil}
     {:name "categories", :schema "PUBLIC", :description nil}}}
  (driver/describe-database :snowflake (update (data/db) :details set/rename-keys {:db :dbname})))

;; if details have neither `:db` nor `:dbname`, they should throw an Exception

(expect-with-driver :snowflake
  Exception
  (driver/describe-database :snowflake (update (data/db) :details set/rename-keys {:db :xyz})))

(deftest can-connect-test
  (datasets/test-driver :snowflake
    (let [can-connect? (fn [details]
                         (driver/can-connect? :snowflake details))]
      (is (= true
             (can-connect? (:details (data/db))))
          "can-connect? should return true for normal Snowflake DB details")
      (is (= false
             (can-connect? (assoc (:details (data/db)) :db (tu/random-name))))
          "can-connect? should return false for Snowflake databases that don't exist (#9041)"))))
