(ns metabase.driver.generic-sql-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [h2 :as h2]
                             [interface :as i])
            [metabase.driver.generic-sql.util :refer [korma-entity]]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (sel :one Table :name "VENUES")))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (Field (id :users :name))))

;; ACTIVE-TABLE-NAMES
(expect
    #{"CATEGORIES" "VENUES" "CHECKINS" "USERS"}
  (i/active-table-names h2/driver (db)))

;; ACTIVE-COLUMN-NAMES->TYPE
(expect
    {"NAME"        :TextField
     "LATITUDE"    :FloatField
     "LONGITUDE"   :FloatField
     "PRICE"       :IntegerField
     "CATEGORY_ID" :IntegerField
     "ID"          :BigIntegerField}
  (i/active-column-names->type h2/driver @venues-table))


;; ## TEST TABLE-PK-NAMES
;; Pretty straightforward
(expect #{"ID"}
  (i/table-pks h2/driver @venues-table))


;; ## TEST FIELD-AVG-LENGTH
(expect 13
  (i/field-avg-length h2/driver @users-name-field))
