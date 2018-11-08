(ns metabase.test.data.crate
  "Code for creating / destroying a Crate database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [metabase.driver.generic-sql :as sql]
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.crate.CrateDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "long"
   :type/Boolean    "boolean"
   :type/Date       "timestamp"
   :type/DateTime   "timestamp"
   :type/Decimal    "integer"
   :type/Float      "float"
   :type/Integer    "integer"
   :type/Text       "string"
   :type/Time       "timestamp"})


(defn- timestamp->crate-datetime
  [value]
  (cond
    (instance? java.sql.Timestamp value)    (.getTime ^java.sql.Timestamp value)
    (instance? honeysql.types.SqlRaw value) (+ (Integer/parseInt (s/trim (s/replace (:s value) #"current_timestamp \+" "")))
                                               (System/currentTimeMillis))
    :else                                   value))

(defn- escape-field-names
  "Escape the field-name keys in ROW-OR-ROWS."
  [row-or-rows]
  (if (sequential? row-or-rows)
    (map escape-field-names row-or-rows)
    (into {} (for [[k v] row-or-rows]
               {(sql/escape-field-name k) (timestamp->crate-datetime v)}))))

(defn- make-load-data-fn
  "Create a `load-data!` function. This creates a function to actually insert a row or rows, wraps it with any WRAP-INSERT-FNS,
   the calls the resulting function with the rows to insert."
  [& wrap-insert-fns]
  (fn [driver dbdef tabledef]
    (let [insert! ((apply comp wrap-insert-fns) (fn [row-or-rows]
                                                  (jdbc/insert-multi!
                                                    (generic/database->spec driver :db dbdef)
                                                    (keyword (i/db-qualified-table-name (name (:database-name dbdef)) (name (:table-name tabledef))))
                                                    (escape-field-names row-or-rows)
                                                    {:transaction? false})))
          rows    (apply list (generic/load-data-get-rows driver dbdef tabledef))]
      (insert! rows))))

(def ^:private database->connection-details
  (constantly {:hosts "localhost:5200/"
               :user  "crate"}))

(extend CrateDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:execute-sql!              generic/sequentially-execute-sql!
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :pk-sql-type               (constantly "integer")
          :create-db-sql             (constantly nil)
          :add-fk-sql                (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :load-data!                (make-load-data-fn generic/load-data-add-ids)
          :qualified-name-components (partial i/single-db-qualified-name-components "doc")})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :crate)}))
