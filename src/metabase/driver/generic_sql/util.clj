(ns metabase.driver.generic-sql.util
  "Shared functions for our generic-sql query processor."
  (:require [clojure.core.memoize :as memo]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [korma.core :as korma]
            [korma.db :as kdb]
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

;; Cache the Korma DB connections for a given Database for 60 seconds instead of creating new ones every single time
(defn- db->connection-spec [database]
  (let [driver                              (driver/engine->driver (:engine database))
        database->connection-details        (:database->connection-details driver)
        connection-details->connection-spec (:connection-details->connection-spec driver)]
    (-> database database->connection-details connection-details->connection-spec)))

(def ^{:arglists '([database])} db->korma-db
  "Return a Korma database definition for DATABASE.
   This does a little bit of smart caching (for 60 seconds) to avoid creating new connections when unneeded."
  (let [-db->korma-db (memo/ttl (fn [database]
                                  (log/debug (color/red "Creating a new DB connection..."))
                                  (assoc (kdb/create-db (db->connection-spec database))
                                         :make-pool? true))
                                :ttl/threshold (* 60 1000))]
    ;; only :engine and :details are needed for driver/connection so just pass those so memoization works as expected
    (fn [database]
      (-db->korma-db (select-keys database [:engine :details])))))

(def ^:dynamic ^java.sql.DatabaseMetaData *jdbc-metadata*
  "JDBC metadata object for a database. This is set by `with-jdbc-metadata`."
  nil)

(defn -with-jdbc-metadata
  "Internal implementation. Don't use this directly; use `with-jdbc-metadata`."
  [database f]
  (if *jdbc-metadata* (f *jdbc-metadata*)
                      (jdbc/with-db-metadata [md (db->connection-spec database)]
                        (binding [*jdbc-metadata* md]
                          (f *jdbc-metadata*)))))

(defmacro with-jdbc-metadata
  "Execute BODY with the jdbc metadata for DATABASE bound to BINDING.
   This will reuse `*jdbc-metadata*` if it's already set (to avoid opening extra connections).
   Otherwise it will open a new metadata connection and bind `*jdbc-metadata*` so it can be reused by subsequent calls to `with-jdbc-metadata` within BODY.

    (with-jdbc-metadata [^java.sql.DatabaseMetaData md (sel :one Database :id 1)] ; (1)
      (-> (.getPrimaryKeys md nil nil nil)
          jdbc/result-set-seq                                                     ; (2)
          doall))                                                                 ; (3)

   NOTES

   1.  You should tag BINDING to avoid reflection.
   2.  Use `jdbc/result-set-seq` to convert JDBC `ResultSet` into something we can use in Clojure
   3.  Make sure to realize the lazy sequence within the BODY before connection is closed."
  [[binding database] & body]
  {:pre [(symbol? binding)]}
  `(-with-jdbc-metadata ~database
     (fn [~binding]
       ~@body)))

(defn korma-entity
  "Return a Korma entity for [DB and] TABLE .

    (-> (sel :one Table :id 100)
        korma-entity
        (select (aggregate (count :*) :count)))"
  ([{db-delay :db, :as table}]
   {:pre [(delay? db-delay)]}
   (korma-entity @db-delay table))
  ([db {table-name :name}]
   {:pre [(map? db)]}
   {:table table-name
    :pk    :id
    :db    (db->korma-db db)}))
