(ns metabase.driver.presto-test
  (:require [expectations :refer :all]
            [toucan.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.table :as table]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util :refer [resolve-private-vars]])
  (:import (metabase.driver.presto PrestoDriver)))

(resolve-private-vars metabase.driver.presto details->uri details->headers quote-name quote+combine-names unprepare apply-page)

;;; HELPERS

(expect
  "http://localhost:8080/"
  (details->uri {:host "localhost", :port 8080, :ssl false} "/"))

(expect
  "https://localhost:8443/"
  (details->uri {:host "localhost", :port 8443, :ssl true} "/"))

(expect
  "http://localhost:8080/v1/statement"
  (details->uri {:host "localhost", :port 8080, :ssl false} "/v1/statement"))

(expect
  {"X-Presto-Source" "metabase"
   "X-Presto-User"   "user"}
  (details->headers {:user "user"}))

(expect
  {"X-Presto-Source"    "metabase"
   "X-Presto-User"      "user"
   "X-Presto-Catalog"   "test_data"
   "X-Presto-Time-Zone" "America/Toronto"}
  (details->headers {:user "user", :catalog "test_data", :report-timezone "America/Toronto"}))

(expect
  "\"weird.table\"\" name\""
  (quote-name "weird.table\" name"))

(expect
  "\"weird . \"\"schema\".\"weird.table\"\" name\""
  (quote+combine-names "weird . \"schema" "weird.table\" name"))

(expect
  ;; adapted from unprepare-test
  "SELECT 'Cam''s Cool Toucan' FROM TRUE WHERE x ?? y AND z = from_iso8601_timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare "SELECT ? FROM ? WHERE x ?? y AND z = ?"
             ["Cam's Cool Toucan", true, #inst "2017-01-01T00:00:00.000Z"]))

;; DESCRIBE-DATABASE
(datasets/expect-with-engine :presto
  {:tables #{{:name "categories" :schema "default"}
             {:name "venues"     :schema "default"}
             {:name "checkins"   :schema "default"}
             {:name "users"      :schema "default"}}}
  (driver/describe-database (PrestoDriver.) (data/db)))

;; DESCRIBE-TABLE
(datasets/expect-with-engine :presto
  {:name   "venues"
   :schema "default"
   :fields #{{:name      "name",
              :base-type :type/Text}
             {:name      "latitude"
              :base-type :type/Float}
             {:name      "longitude"
              :base-type :type/Float}
             {:name      "price"
              :base-type :type/Integer}
             {:name      "category_id"
              :base-type :type/Integer}
             {:name      "id"
              :base-type :type/Integer}}}
  (driver/describe-table (PrestoDriver.) (data/db) (db/select-one 'Table :id (data/id :venues))))

;;; ANALYZE-TABLE
(datasets/expect-with-engine :presto
  {:row_count 100
   :fields    [{:id (data/id :venues :category_id), :values [2 3 4 5 6 7 10 11 12 13 14 15 18 19 20 29 40 43 44 46 48 49 50 58 64 67 71 74]}
               {:id (data/id :venues :id)}
               {:id (data/id :venues :latitude)}
               {:id (data/id :venues :longitude)}
               {:id (data/id :venues :name), :values (db/select-one-field :values 'FieldValues, :field_id (data/id :venues :name))}
               {:id (data/id :venues :price), :values [1 2 3 4]}]}
  (let [venues-table (db/select-one 'Table :id (data/id :venues))]
    (driver/analyze-table (PrestoDriver.) venues-table (set (mapv :id (table/fields venues-table))))))

;;; FIELD-VALUES-LAZY-SEQ
(datasets/expect-with-engine :presto
  ["Red Medicine"
   "Stout Burgers & Beers"
   "The Apple Pan"
   "Wurstküche"
   "Brite Spot Family Restaurant"]
  (take 5 (driver/field-values-lazy-seq (PrestoDriver.) (db/select-one 'Field :id (data/id :venues :name)))))

;;; TABLE-ROWS-SEQ
(datasets/expect-with-engine :presto
  [{:name "Red Medicine",                 :price 3, :category_id  4, :id 1}
   {:name "Stout Burgers & Beers",        :price 2, :category_id 11, :id 2}
   {:name "The Apple Pan",                :price 2, :category_id 11, :id 3}
   {:name "Wurstküche",                   :price 2, :category_id 29, :id 4}
   {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
  (for [row (take 5 (sort-by :id (driver/table-rows-seq (PrestoDriver.)
                                                        (db/select-one 'Database :id (data/id))
                                                        (db/select-one 'RawTable :id (db/select-one-field :raw_table_id 'Table, :id (data/id :venues))))))]
    (-> (dissoc row :latitude :longitude)
        (update :price int)
        (update :category_id int)
        (update :id int))))

;;; FIELD-PERCENT-URLS
(datasets/expect-with-engine :presto
  0.5
  (data/dataset half-valid-urls
    (sql/field-percent-urls (PrestoDriver.) (db/select-one 'Field :id (data/id :urls :url)))))

;;; APPLY-PAGE
(expect
  {:select ["name" "id"]
   :from   [{:select   [[:default.categories.name "name"] [:default.categories.id "id"] [{:s "row_number() OVER (ORDER BY \"default\".\"categories\".\"id\" ASC)"} :__rownum__]]
             :from     [:default.categories]
             :order-by [[:default.categories.id :asc]]}]
   :where  [:> :__rownum__ 5]
   :limit  5}
  (apply-page {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
               :from     [:default.categories]
               :order-by [[:default.categories.id :asc]]}
              {:page {:page  2
                      :items 5}}))
