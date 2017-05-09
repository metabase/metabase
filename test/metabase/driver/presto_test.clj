(ns metabase.driver.presto-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.table :as table]
            [metabase.test
             [data :as data]
             [util :refer [resolve-private-vars]]]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db])
  (:import metabase.driver.presto.PrestoDriver))

(resolve-private-vars metabase.driver.presto details->uri details->request parse-presto-results quote-name quote+combine-names apply-page)

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
  {:headers {"X-Presto-Source" "metabase"
             "X-Presto-User"   "user"}}
  (details->request {:user "user"}))

(expect
  {:headers    {"X-Presto-Source" "metabase"
                "X-Presto-User"   "user"}
   :basic-auth ["user" "test"]}
  (details->request {:user "user", :password "test"}))

(expect
  {:headers {"X-Presto-Source"    "metabase"
             "X-Presto-User"      "user"
             "X-Presto-Catalog"   "test_data"
             "X-Presto-Time-Zone" "America/Toronto"}}
  (details->request {:user "user", :catalog "test_data", :report-timezone "America/Toronto"}))

(expect
  [["2017-04-03"
    #inst "2017-04-03T14:19:17.417000000-00:00"
    #inst "2017-04-03T10:19:17.417000000-00:00"
    3.1416M
    "test"]]
  (parse-presto-results [{:type "date"} {:type "timestamp with time zone"} {:type "timestamp"} {:type "decimal(10,4)"} {:type "varchar(255)"}]
                        [["2017-04-03", "2017-04-03 10:19:17.417 America/Toronto", "2017-04-03 10:19:17.417", "3.1416", "test"]]))

(expect
  "\"weird.table\"\" name\""
  (quote-name "weird.table\" name"))

(expect
  "\"weird . \"\"schema\".\"weird.table\"\" name\""
  (quote+combine-names "weird . \"schema" "weird.table\" name"))

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

(expect
  #"com.jcraft.jsch.JSchException:"
  (try
    (let [engine :presto
      details {:ssl false,
               :password "changeme",
               :tunnel-host "localhost",
               :tunnel-pass "BOGUS-BOGUS",
               :catalog "BOGUS"
               :host "localhost",
               :tunnel-enabled true,
               :tunnel-port 22,
               :tunnel-user "bogus"}]
      (driver/can-connect-with-details? engine details :rethrow-exceptions))
       (catch Exception e
         (.getMessage e))))
