(ns metabase.driver.snowflake-test
  (:require [clojure.set :as set]
            [metabase.driver.snowflake :as snowflake]
            [metabase.models.table :refer [Table]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :refer [expect-with-engine]]))

(expect-with-engine :snowflake
  "UTC"
  (tu/db-timezone-id))

;; does describe-database (etc) use the NAME FROM DETAILS instead of the DB DISPLAY NAME to fetch metadata? (#8864)
(expect-with-engine :snowflake
  {:tables
   #{{:name "users",      :schema "PUBLIC", :description nil}
     {:name "venues",     :schema "PUBLIC", :description nil}
     {:name "checkins",   :schema "PUBLIC", :description nil}
     {:name "categories", :schema "PUBLIC", :description nil}}}
  (#'snowflake/describe-database (snowflake/->SnowflakeDriver) (assoc (data/db) :name "ABC")))

;; make sure describe-table uses the NAME FROM DETAILS too
(expect-with-engine :snowflake
  {:name   "categories"
   :schema "PUBLIC"
   :fields #{{:name          "id"
              :database-type "NUMBER"
              :base-type     :type/Number
              :pk?           true}
             {:name "name", :database-type "VARCHAR", :base-type :type/Text}}}
  (#'snowflake/describe-table (snowflake/->SnowflakeDriver) (assoc (data/db) :name "ABC") (Table (data/id :categories))))

;; make sure describe-table-fks uses the NAME FROM DETAILS too
(expect-with-engine :snowflake
  #{{:fk-column-name   "category_id"
     :dest-table       {:name "categories", :schema "PUBLIC"}
     :dest-column-name "id"}}
  (#'snowflake/describe-table-fks (snowflake/->SnowflakeDriver) (assoc (data/db) :name "ABC") (Table (data/id :venues))))

;; describe-database (etc) should accept either `:db` or `:dbname` in the details, working around a bug with the
;; original Snowflake impl
(expect-with-engine :snowflake
  {:tables
   #{{:name "users",      :schema "PUBLIC", :description nil}
     {:name "venues",     :schema "PUBLIC", :description nil}
     {:name "checkins",   :schema "PUBLIC", :description nil}
     {:name "categories", :schema "PUBLIC", :description nil}}}
  (#'snowflake/describe-database (snowflake/->SnowflakeDriver) (update (data/db) :details set/rename-keys {:db :dbname})))

;; if details have neither `:db` nor `:dbname`, they should throw an Exception

(expect-with-engine :snowflake
  Exception
  (#'snowflake/describe-database (snowflake/->SnowflakeDriver) (update (data/db) :details set/rename-keys {:db :xyz})))
