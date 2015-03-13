(ns metabase.driver.generic-sql.util
  "Shared functions for our generic-sql query processor."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.db :as kdb]
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))


;; Cache the Korma DB connections for given Database
;; instead of creating new ones every single time
(def ^:private connection->korma-db
  (memoize
    (fn [connection]
      {:pre [(map? connection)]}
      (log/debug "CREATING A NEW DB CONNECTION...")
      (kdb/create-db connection))))

(defn korma-db
  "Return a Korma database definition for DATABASE."
  [database]
  (log/debug "CREATING A NEW DB CONNECTION...")
  (connection->korma-db (driver/connection database)))


(def ^:dynamic *jdbc-metadata*
  "JDBC metadata object for a database. This is set by `with-jdbc-metadata`."
  nil)

(defn with-jdbc-metadata
  "Call fn F with the JDBC Metadata for DATABASE.
   This will reuse `*jdbc-metadata*` if it's already set (to avoid opening extra connections).
   Otherwise it will open a new metadata connection and bind `*jdbc-metadata*` so it's available in subsequent calls to `with-jdbc-metadata` within F."
  [database f]
  (if *jdbc-metadata* (f *jdbc-metadata*)
                      (jdbc/with-db-metadata [md (driver/connection database)]
                        (binding [*jdbc-metadata* md]
                          (f *jdbc-metadata*)))))

(defn korma-entity
  "Return a Korma entity for TABLE.

    (-> (sel :one Table :id 100)
        korma-entity
        (select (aggregate (count :*) :count)))"
  [{:keys [name db]}]
  {:table name
   :pk    :id
   :db    (korma-db @db)})


(defn table-id->korma-entity
  "Lookup `Table` with TABLE-ID and return a korma entity that can be used in a korma form."
  [table-id]
  {:pre [(integer? table-id)]
   :post [(map? %)]}
  (let [table (sel :one Table :id table-id)]
    (when-not table (throw (Exception. (format "Table with ID %d doesn't exist!" table-id))))
    (korma-entity table)))


;; TODO - should we memoize this?
(defn field-id->kw
  "Lookup `Field` with FIELD-ID and return its name as a keyword (suitable for use in a korma clause)."
  [field-id]
  {:pre [(integer? field-id)]
   :post [(keyword? %)]}
  (or (-> (sel :one [Field :name] :id field-id)
        :name
        keyword)
    (throw (Exception. (format "Field with ID %d doesn't exist!" field-id)))))
