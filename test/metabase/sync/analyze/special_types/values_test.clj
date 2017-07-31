(ns metabase.sync.analyze.special-types.values-test
  (:require [metabase
             [driver :as driver]
             [query-processor-test :as qp-test]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.special-types.values :as special-types-values]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db]))

(defn- field-values
  "Return a sequence of values for Field. This is the same data that other functions see; it is a result of
   calling `metabase.sync.analyze.special-types.values/field-values`."
  ([table-kw field-kw]
   (field-values (db/select-one Field :id (data/id table-kw field-kw))))
  ([field]
   (let [driver (driver/->driver (db/select-one-field :db_id Table :id (:table_id field)))]
     (driver/sync-in-context driver (Database (data/id))
       (fn []
         (#'special-types-values/field-values driver field))))))

;; field-avg-length
;; This test won't work for Druid because it doesn't have a 'venues' Table. TODO - Add a test for Druid as well
(datasets/expect-with-engines qp-test/non-timeseries-engines
  16
  (Math/round (#'special-types-values/avg-length (field-values :venues :name))))
