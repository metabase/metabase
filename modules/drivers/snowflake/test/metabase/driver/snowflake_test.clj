(ns metabase.driver.snowflake-test
  (:require [clojure.set :as set]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.table :refer [Table]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as dataset-defs]
             [datasets :refer [expect-with-driver]]
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.test.data.sql.ddl :as ddl]))

;; make sure we didn't break the code that is used to generate DDL statements when we add new test datasets
(expect
  "DROP DATABASE IF EXISTS \"test-data\"; CREATE DATABASE \"test-data\";"
  (sql.tx/create-db-sql :snowflake (tx/get-dataset-definition dataset-defs/test-data)))

(expect
  ["DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"users\";"
   (str "CREATE TABLE \"test-data\".\"PUBLIC\".\"users\" (\"name\" TEXT  ,\"last_login\" TIMESTAMPLTZ"
        "  ,\"password\" TEXT , \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;")
   "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"categories\";"
   (str "CREATE TABLE \"test-data\".\"PUBLIC\".\"categories\" (\"name\" TEXT , \"id\" INTEGER AUTOINCREMENT,"
        " PRIMARY KEY (\"id\")) ;")
   "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"venues\";"
   (str "CREATE TABLE \"test-data\".\"PUBLIC\".\"venues\" (\"name\" TEXT  ,\"latitude\" FLOAT  ,\"longitude\" FLOAT"
        "  ,\"price\" INTEGER  ,\"category_id\" INTEGER , \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;")
   "DROP TABLE IF EXISTS \"test-data\".\"PUBLIC\".\"checkins\";"
   (str "CREATE TABLE \"test-data\".\"PUBLIC\".\"checkins\" (\"user_id\" INTEGER  ,\"venue_id\" INTEGER  ,\"date\" DATE ,"
        " \"id\" INTEGER AUTOINCREMENT, PRIMARY KEY (\"id\")) ;")
   (str "ALTER TABLE \"test-data\".\"PUBLIC\".\"venues\" ADD CONSTRAINT \"fk_venues_category_id_categori\" FOREIGN KEY"
        " (\"category_id\") REFERENCES \"test-data\".\"PUBLIC\".\"categories\" (\"id\");")
   (str "ALTER TABLE \"test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"fk_checkins_user_id_users\""
        " FOREIGN KEY (\"user_id\") REFERENCES \"test-data\".\"PUBLIC\".\"users\" (\"id\");")
   (str "ALTER TABLE \"test-data\".\"PUBLIC\".\"checkins\" ADD CONSTRAINT \"fk_checkins_venue_id_venues\""
        " FOREIGN KEY (\"venue_id\") REFERENCES \"test-data\".\"PUBLIC\".\"venues\" (\"id\");")]
  (ddl/create-db-ddl-statements :snowflake (tx/get-dataset-definition dataset-defs/test-data)))

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

;; Make sure that can-connect? returns false for Snowflake databases that don't exist (#9041)
(expect-with-driver :snowflake
  {:normal      true
   :random-name false}
  (let [can-connect? (fn [& [additional-details]]
                       (driver/can-connect? :snowflake (merge (:details (data/db))
                                                              additional-details)))]
    {:normal      (can-connect?)
     :random-name (can-connect? {:db (tu/random-name)})}))
