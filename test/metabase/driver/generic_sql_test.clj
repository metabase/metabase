(ns metabase.driver.generic-sql-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :refer :all]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]])
  (:import metabase.driver.h2.H2Driver))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (Table (id :venues))))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (Field (id :users :name))))


;; ANALYZE-TABLE

;; DESCRIBE-DATABASE
(expect
  {:tables #{{:name   "CATEGORIES"
              :schema "PUBLIC"
              :fields [{:name "NAME",
                        :column-type "VARCHAR",
                        :base-type :TextField}
                       {:name "ID",
                        :column-type "BIGINT",
                        :base-type :BigIntegerField,
                        :pk? true}]}
             {:name   "VENUES"
              :schema "PUBLIC"
              :fields [{:name "NAME",
                        :column-type "VARCHAR",
                        :base-type :TextField}
                       {:name "LATITUDE",
                        :column-type "DOUBLE",
                        :base-type :FloatField}
                       {:name "LONGITUDE",
                        :column-type "DOUBLE",
                        :base-type :FloatField}
                       {:name "PRICE",
                        :column-type "INTEGER",
                        :base-type :IntegerField}
                       {:name "CATEGORY_ID",
                        :column-type "INTEGER",
                        :base-type :IntegerField,
                        :fk {:dest-table "CATEGORIES",
                             :dest-field "ID"}}
                       {:name "ID",
                        :column-type "BIGINT",
                        :base-type :BigIntegerField,
                        :pk? true}]}
             {:name   "CHECKINS"
              :schema "PUBLIC"
              :fields [{:name "USER_ID",
                        :column-type "INTEGER",
                        :base-type :IntegerField,
                        :fk {:dest-table "USERS",
                             :dest-field "ID"}}
                       {:name "VENUE_ID",
                        :column-type "INTEGER",
                        :base-type :IntegerField,
                        :fk {:dest-table "VENUES",
                             :dest-field "ID"}}
                       {:name "DATE",
                        :column-type "DATE",
                        :base-type :DateField}
                       {:name "ID",
                        :column-type "BIGINT",
                        :base-type :BigIntegerField,
                        :pk? true}]}
             {:name   "USERS"
              :schema "PUBLIC"
              :fields [{:name "NAME",
                        :column-type "VARCHAR",
                        :base-type :TextField}
                       {:name "LAST_LOGIN",
                        :column-type "TIMESTAMP",
                        :base-type :DateTimeField}
                       {:name "PASSWORD",
                        :column-type "VARCHAR",
                        :base-type :TextField}
                       {:name "ID",
                        :column-type "BIGINT",
                        :base-type :BigIntegerField,
                        :pk? true}]}}}
  (driver/describe-database (H2Driver.) (db)))

;; DESCRIBE-TABLE
(expect
  {:name   "VENUES"
   :schema "PUBLIC"
   :fields [{:name "NAME",
             :column-type "VARCHAR",
             :base-type :TextField}
            {:name "LATITUDE",
             :column-type "DOUBLE",
             :base-type :FloatField}
            {:name "LONGITUDE",
             :column-type "DOUBLE",
             :base-type :FloatField}
            {:name "PRICE",
             :column-type "INTEGER",
             :base-type :IntegerField}
            {:name "CATEGORY_ID",
             :column-type "INTEGER",
             :base-type :IntegerField,
             :fk {:dest-table "CATEGORIES",
                  :dest-field "ID"}}
            {:name "ID",
             :column-type "BIGINT",
             :base-type :BigIntegerField,
             :pk? true}]}
  (driver/describe-table (H2Driver.) (db) (:name @venues-table)))


;; ## TEST FIELD-AVG-LENGTH
(expect 13
  (driver/field-avg-length (H2Driver.) @users-name-field))
