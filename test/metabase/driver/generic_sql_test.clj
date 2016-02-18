(ns metabase.driver.generic-sql-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :refer :all]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]
            [metabase.models.table :as table])
  (:import metabase.driver.h2.H2Driver))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (Table (id :venues))))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (Field (id :users :name))))


;; DESCRIBE-DATABASE
(expect
  {:tables #{{:name "CATEGORIES" :schema "PUBLIC"}
             {:name "VENUES"     :schema "PUBLIC"}
             {:name "CHECKINS"   :schema "PUBLIC"}
             {:name "USERS"      :schema "PUBLIC"}}}
  (driver/describe-database (H2Driver.) (db)))

;; DESCRIBE-TABLE
(expect
  {:name   "VENUES"
   :schema "PUBLIC"
   :fields #{{:name "NAME",
              :column-type "VARCHAR",
              :base-type :type/text}
             {:name "LATITUDE",
              :column-type "DOUBLE",
              :base-type :type/number.float}
             {:name "LONGITUDE",
              :column-type "DOUBLE",
              :base-type :type/number.float}
             {:name "PRICE",
              :column-type "INTEGER",
              :base-type :type/number.integer}
             {:name "CATEGORY_ID",
              :column-type "INTEGER",
              :base-type :type/number.integer}
             {:name "ID",
              :column-type "BIGINT",
              :base-type :type/number.integer.big,
              :pk? true}}}
  (driver/describe-table (H2Driver.) @venues-table))

;; DESCRIBE-TABLE-FKS
(expect
  #{{:fk-column-name   "CATEGORY_ID"
     :dest-table       {:name   "CATEGORIES"
                        :schema "PUBLIC"}
     :dest-column-name "ID"}}
  (driver/describe-table-fks (H2Driver.) @venues-table))


;; ANALYZE-TABLE

(expect
  {:row_count 100,
   :fields    [{:id (id :venues :category_id)}
               {:id (id :venues :id)}
               {:id (id :venues :latitude)}
               {:id (id :venues :longitude)}
               {:id (id :venues :name), :values nil}
               {:id (id :venues :price), :values [1 2 3 4]}]}
  (driver/analyze-table (H2Driver.) @venues-table (set (mapv :id (table/fields @venues-table)))))
