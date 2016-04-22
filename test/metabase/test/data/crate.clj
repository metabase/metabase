(ns metabase.test.data.crate
  "Code for creating / destroying a Crate database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            metabase.driver.crate
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.driver.generic-sql :as sql]
            [clojure.java.jdbc :as jdbc]
            [metabase.util :as u]
            [clojure.string :as s])
  (:import metabase.driver.crate.CrateDriver))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "long"
   :BooleanField    "boolean"
   :CharField       "string"
   :DateField       "timestamp"
   :DateTimeField   "timestamp"
   :DecimalField    "integer"
   :FloatField      "float"
   :IntegerField    "integer"
   :TextField       "string"
   :TimeField       "timestamp"})


(defn- timestamp->CrateDateTime
  [value]
  (if (= (instance? java.sql.Timestamp value) true)
    (.getTime (u/->Timestamp value))
    (if (= (and (= (instance? clojure.lang.PersistentArrayMap value) true) (contains? value :korma.sql.utils/generated)) true)
      (+ (read-string (s/replace (:korma.sql.utils/generated value) #"CURRENT_TIMESTAMP \+" "")) (.getTime (u/new-sql-timestamp)))
      value)))

(defn- escape-field-names
  "Escape the field-name keys in ROW-OR-ROWS."
  [row-or-rows]
  (if (sequential? row-or-rows)
    (map escape-field-names row-or-rows)
    (into {} (for [[k v] row-or-rows]
               {(sql/escape-field-name k) (timestamp->CrateDateTime v)}))))

(defn- make-load-data-fn
  "Create a `load-data!` function. This creates a function to actually insert a row or rows, wraps it with any WRAP-INSERT-FNS,
   the calls the resulting function with the rows to insert."
  [& wrap-insert-fns]
  (fn [driver dbdef tabledef]
    (let [insert!   ((apply comp wrap-insert-fns) (fn [row-or-rows]
                                                    (apply jdbc/insert!
                                                           (generic/database->spec driver :db dbdef)
                                                           (keyword (get tabledef :table-name))
                                                           :transaction? false
                                                           (escape-field-names row-or-rows))))
          rows      (apply list (generic/load-data-get-rows driver dbdef tabledef))]
      (insert! rows))))

(defn- database->connection-details [_ _ {:keys [_ _]}]
  (merge {:host         "localhost"
          :port         4300}))

(extend CrateDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:execute-sql!              generic/sequentially-execute-sql!
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))
          :pk-sql-type               (constantly "integer")
          :create-db-sql             (constantly nil)
          :add-fk-sql                (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :load-data!                (make-load-data-fn generic/load-data-add-ids)})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details   database->connection-details
          :engine                         (constantly :crate)
          :default-schema                 (constantly "doc")}))
