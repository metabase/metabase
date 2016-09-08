(ns metabase.driver.generic-sql-test
  (:require [expectations :refer :all]
            (metabase [db :as db]
                      [driver :as driver])
            (metabase.driver [generic-sql :refer :all]
                             h2)
            (metabase.models [field :refer [Field]]
                             [table :refer [Table], :as table])
            [metabase.test.data :refer :all]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets])
            [metabase.test.util :refer [resolve-private-fns]])
  (:import metabase.driver.h2.H2Driver))

(def ^:private users-table      (delay (Table :name "USERS")))
(def ^:private venues-table     (delay (Table (id :venues))))
(def ^:private users-name-field (delay (Field (id :users :name))))

(def ^:private generic-sql-engines
  (delay (set (for [engine datasets/all-valid-engines
                    :let   [driver (driver/engine->driver engine)]
                    :when  (not= engine :bigquery)                                       ; bigquery doesn't use the generic sql implementations of things like `field-avg-length`
                    :when  (extends? ISQLDriver (class driver))]
                (do (require (symbol (str "metabase.test.data." (name engine))) :reload) ; otherwise it gets all snippy if you try to do `lein test metabase.driver.generic-sql-test`
                    engine)))))


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
   :fields #{{:name      "NAME",
              :custom    {:column-type "VARCHAR"}
              :base-type :TextField}
             {:name      "LATITUDE"
              :custom    {:column-type "DOUBLE"}
              :base-type :FloatField}
             {:name      "LONGITUDE"
              :custom    {:column-type "DOUBLE"}
              :base-type :FloatField}
             {:name      "PRICE"
              :custom    {:column-type "INTEGER"}
              :base-type :IntegerField}
             {:name      "CATEGORY_ID"
              :custom    {:column-type "INTEGER"}
              :base-type :IntegerField}
             {:name      "ID"
              :custom    {:column-type "BIGINT"}
              :base-type :BigIntegerField
              :pk?       true}}}
  (driver/describe-table (H2Driver.) (db) @venues-table))

;; DESCRIBE-TABLE-FKS
(expect
  #{{:fk-column-name   "CATEGORY_ID"
     :dest-table       {:name   "CATEGORIES"
                        :schema "PUBLIC"}
     :dest-column-name "ID"}}
  (driver/describe-table-fks (H2Driver.) (db) @venues-table))


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

(resolve-private-fns metabase.driver.generic-sql field-avg-length field-values-lazy-seq table-rows-seq)

;;; FIELD-AVG-LENGTH
(datasets/expect-with-engines @generic-sql-engines
  ;; Not sure why some databases give different values for this but they're close enough that I'll allow them
  (if (contains? #{:redshift :sqlserver} datasets/*engine*)
    15
    16)
  (field-avg-length datasets/*driver* (db/select-one 'Field :id (id :venues :name))))

;;; FIELD-VALUES-LAZY-SEQ
(datasets/expect-with-engines @generic-sql-engines
  ["Red Medicine"
   "Stout Burgers & Beers"
   "The Apple Pan"
   "Wurstküche"
   "Brite Spot Family Restaurant"]
  (take 5 (field-values-lazy-seq datasets/*driver* (db/select-one 'Field :id (id :venues :name)))))


;;; TABLE-ROWS-SEQ
(datasets/expect-with-engines @generic-sql-engines
  [{:name "Red Medicine",                 :price 3, :category_id  4, :id 1}
   {:name "Stout Burgers & Beers",        :price 2, :category_id 11, :id 2}
   {:name "The Apple Pan",                :price 2, :category_id 11, :id 3}
   {:name "Wurstküche",                   :price 2, :category_id 29, :id 4}
   {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
  (for [row (take 5 (sort-by :id (table-rows-seq datasets/*driver*
                                                 (db/select-one 'Database :id (id))
                                                 (db/select-one 'RawTable :id (db/select-one-field :raw_table_id 'Table, :id (id :venues))))))]
    ;; different DBs use different precisions for these
    (-> (dissoc row :latitude :longitude)
        (update :price int)
        (update :category_id int)
        (update :id int))))

;;; FIELD-PERCENT-URLS
(datasets/expect-with-engines @generic-sql-engines
  (if (= datasets/*engine* :oracle)
    ;; Oracle considers empty strings to be NULL strings; thus in this particular test `percent-valid-urls` gives us 4/7 valid valid where other DBs give us 4/8
    0.5714285714285714
    0.5)
  (dataset half-valid-urls
    (field-percent-urls datasets/*driver* (db/select-one 'Field :id (id :urls :url)))))
