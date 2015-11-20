(ns metabase.driver.generic-sql-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.h2 :refer [h2]]
            [metabase.driver.generic-sql.util :refer [korma-entity]]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (Table (id :venues))))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (Field (id :users :name))))

;; ACTIVE-TABLES
(expect
    #{{:name "CATEGORIES", :schema "PUBLIC"}
      {:name "VENUES",     :schema "PUBLIC"}
      {:name "CHECKINS",   :schema "PUBLIC"}
      {:name "USERS",      :schema "PUBLIC"}}
    (driver/active-tables h2 (db)))

;; ACTIVE-COLUMN-NAMES->TYPE
(expect
    {"NAME"        :TextField
     "LATITUDE"    :FloatField
     "LONGITUDE"   :FloatField
     "PRICE"       :IntegerField
     "CATEGORY_ID" :IntegerField
     "ID"          :BigIntegerField}
  (driver/active-column-names->type h2 @venues-table))


;; ## TEST TABLE-PK-NAMES
;; Pretty straightforward
(expect #{"ID"}
  (driver/table-pks h2 @venues-table))


;; ## TEST FIELD-AVG-LENGTH
(expect 13
  (driver/field-avg-length h2 @users-name-field))
