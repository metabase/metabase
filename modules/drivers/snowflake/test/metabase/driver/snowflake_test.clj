(ns metabase.driver.snowflake-test
  (:require [clojure.set :as set]
            [metabase.driver :as driver]
            [metabase.models.table :refer [Table]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :refer [expect-with-driver]]))

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
