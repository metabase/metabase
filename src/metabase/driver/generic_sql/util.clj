(ns metabase.driver.generic-sql.util
  "Shared functions for our generic-sql query processor."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            (korma [core :as korma]
                   [db :as kdb])
            [korma.sql.utils :as utils]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp]))

(defn- db->connection-spec
  "Return a JDBC connection spec for a Metabase `Database`."
  [{{:keys [short-lived?]} :details, :as database}]
  (let [driver (driver/engine->driver (:engine database))]
    (assoc (@(resolve 'metabase.driver.generic-sql/connection-details->spec) driver (:details database))
           ;; unless this is a temp DB, we need to make a pool or the connection will be closed before we get a chance to unCLOB-er the results during JSON serialization
           ;; TODO - what will we do once we have CLOBS in temp DBs?
           :make-pool? (not short-lived?))))

(def ^{:arglists '([database])}
  db->korma-db
  "Return a Korma database definition for DATABASE.
   Since Korma/C3PO seems to be bad about cleaning up its connection pools, this function is
   memoized and will return an existing connection pool on subsequent calls."
  (let [db->korma-db          (fn [database]
                                (log/debug (color/red "Creating a new DB connection..."))
                                (kdb/create-db (db->connection-spec database)))
        memoized-db->korma-db (memoize db->korma-db)]
    (fn [{{:keys [short-lived?]} :details, :as database}]
      ;; Use un-memoized version of function for so-called "short-lived" databases (i.e. temporary ones that we won't create a connection pool for)
      ((if short-lived?
         db->korma-db
         memoized-db->korma-db) (select-keys database [:engine :details]))))) ; only :engine and :details are needed for driver/connection so just pass those so memoization works as expected

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
  {:arglists '([table] [db table])}
  ([{db-delay :db, :as table}]
   {:pre [(delay? db-delay)]}
   (korma-entity @db-delay table))
  ([db {schema :schema, table-name :name}]
   {:pre [(map? db)]}
   {:table (if (seq schema)
             (str schema \. table-name)
             table-name)
    :pk    :id
    :db    (db->korma-db db)}))

(defn funcs
  "Convenience for writing nested `utils/func` forms.
   The first argument is treated the same as with `utils/func`;
   But when any arg is a vector we'll treat it as a recursive call to `funcs`.

     (funcs \"CONCAT(%s)\" [\"YEAR(%s)\" x] y [\"MONTH(%s)\" z])
       -> (utils/func \"CONCAT(%s)\" [(utils/func \"YEAR(%s)\" [x])
                                      y
                                      (utils/func \"MONTH(%s)\" [z])])"
  [fn-format-str & args]
  (utils/func fn-format-str (vec (for [arg args]
                                   (if (vector? arg) (apply funcs arg)
                                       arg)))))
