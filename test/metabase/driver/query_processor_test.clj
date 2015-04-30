(ns metabase.driver.query-processor-test
  "Query processing tests that can be ran between any of the available drivers, and should give the same results."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.test-data :as mongo-data]
            (metabase.models [table :refer [Table]])
            [metabase.test-data :as generic-sql-data]))

;; ## Functionality for writing driver-independent tests

(def ^:dynamic *db* "Bound to `Database` for the current driver inside body of `with-driver`.")
(def ^:dynamic *db-id* "Bound to ID of `Database` for the current driver inside body of `with-driver`.")
(def ^:dynamic *driver-data*)

(defprotocol DriverData
  (db [this]
    "Return `Database` containing test data for this driver.")
  (table-name->table [this table-name]
    "Given a TABLE-NAME keyword like `:venues`, *fetch* the corresponding `Table`."))

(deftype MongoDriverData []
  DriverData
  (db [_]
    @mongo-data/mongo-test-db)
  (table-name->table [_ table-name]
    (mongo-data/table-name->table table-name)))

(deftype GenericSqlDriverData []
  DriverData
  (db [_]
    @generic-sql-data/test-db)
  (table-name->table [_ table-name]
    (generic-sql-data/table-name->table table-name)))

(def driver-name->driver-data
  {:mongo       (MongoDriverData.)
   :generic-sql (GenericSqlDriverData.)})

(def driver-name->db-delay
  "Map of `driver-name` to a delay that will return the corresponding `Database`."
  {:mongo       mongo-data/mongo-test-db
   :generic-sql generic-sql-data/test-db})
(def valid-driver-names (set (keys driver-name->db-delay)))

(defmacro with-driver
  "Execute BODY with `*db*` and `*db-id*` bound to appropriate places for "
  [driver-name & body]
  {:pre [(keyword? driver-name)
         (contains? valid-driver-names driver-name)]}
  `(let [driver-data# (driver-name->driver-data ~driver-name)
         db#          (db driver-data#)]
     (binding [*driver-data* driver-data#
               *db* db#
               *db-id* (:id db#)]
       (assert (integer? *db-id*))
       ~@body)))

(defmacro expect-with-all-drivers
  "Like expect, but runs a test inside of `with-driver` for *each* of the available drivers."
  [expected actual]
  `(do ~@(mapcat (fn [driver-name]
                   `[(expect
                         (with-driver ~driver-name
                           ~expected)
                       (with-driver ~driver-name
                         ~actual))])
                 valid-driver-names)))


;; ##  Driver-Independent Data Fns

(defn ->table
  "Given keyword TABLE-NAME, fetch corresponding `Table` in `*db*`."
  [table-name]
  {:pre [*driver-data*]
   :post [(map? %)]}
  (table-name->table *driver-data* table-name))

(defn ->table-id [table-name]
  {:pre [*driver-data*]
   :post [(integer? %)]}
  (:id (->table table-name)))

#_(def ^{:arglists '([table-name])} table-name->id
  "Given keyword TABLE-NAME, fetch ID of corresponding `Table` in `*db*`."
  (let [-table-name->id (memoize (fn [db-id table-name]
                                   {:pre [(integer? db-id)
                                          (keyword? table-name)]
                                    :post [(integer? %)]}
                                   (sel :one :id Table :db_id db-id :name (name table-name))))]
    (fn [table-name]
      {:pre [(integer? *db-id*)]}
      (-table-name->id *db-id* table-name))))


;; ## Driver-Independent QP Tests

(defmacro qp-expect-with-all-drivers
  "Slightly more succinct way of writing QP tests. Adds standard boilerplate to actual/expected forms."
  [data query]
  `(expect-with-all-drivers
       {:status :completed
        :row_count ~(count (:rows data))
        :data ~data}
     (driver/process-query {:type :query
                            :database *db-id*
                            :query ~query})))

;; ### "COUNT" AGGREGATION
(qp-expect-with-all-drivers
    {:rows [[100]]
     :columns ["count"]
     :cols [{:base_type :IntegerField
             :special_type :number
             :name "count"
             :id nil
             :table_id nil
             :description nil}]}
  {:source_table (->table-id :venues)
   :filter [nil nil]
   :aggregation ["count"]
   :breakout [nil]
   :limit nil})
