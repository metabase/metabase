(ns metabase.test.data.one-off-dbs
  "Test utility functions for using one-off temporary in-memory H2 databases, including completely blank ones and the
  infamous `blueberries_consumed` database, used by sync tests in several different namespaces."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [metabase
             [db :as mdb]
             [sync :as sync]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models.database :refer [Database]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [toucan.util.test :as tt]))

(def ^:dynamic *conn*
  "Bound to a JDBC connection spec when using one of the `with-db` macros below."
  nil)

;;; ---------------------------------------- Generic Empty Temp In-Memory DB -----------------------------------------

(defn do-with-blank-db
  "Impl for `with-blank-db` macro; prefer that to using this directly."
  [f]
  (let [details {:db (str "mem:" (tu/random-name) ";DB_CLOSE_DELAY=10")}]
    (binding [mdb/*allow-potentailly-unsafe-connections* true]
      (tt/with-temp Database [db {:engine :h2, :details details}]
        (data/with-db db
          (jdbc/with-db-connection [conn (sql-jdbc.conn/connection-details->spec :h2 details)]
            (binding [*conn* conn]
              (f))))))))

(defmacro with-blank-db
  "An empty canvas upon which you may paint your dreams.

  Creates a one-off tempory in-memory H2 database and binds this DB with `data/with-db` so you can use `data/db` and
  `data/id` to access it. `*conn*` is bound to a JDBC connection spec so you can execute DDL statements to populate it
  as needed."
  {:style/indent 0}
  [& body]
  `(do-with-blank-db (fn [] ~@body)))


;;; ------------------------------------------------- Blueberries DB -------------------------------------------------

(defn do-with-blueberries-db
  "Impl for `with-blueberries-db` macro; use that instead of using this directly."
  [f]
  (with-blank-db
    (jdbc/execute! *conn* ["CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL);"])
    (f)))

(defmacro with-blueberries-db
  "Creates a database with a single table, `blueberries_consumed`, with one column, `num`."
  {:style/indent 0}
  [& body]
  `(do-with-blueberries-db (fn [] ~@body)))


;;; ------------------------------------ Helper Fns for Populating Blueberries DB ------------------------------------

(defn- insert-range-sql
  "Generate SQL to insert a row for each number in `rang`."
  [rang]
  (str "INSERT INTO blueberries_consumed (num) VALUES "
       (str/join ", " (for [n rang]
                        (str "(" n ")")))))

(defn insert-rows-and-sync!
  "With the temp blueberries db from above, insert a `range` of values and re-sync the DB.

     (insert-rows-and-sync! [0 1 2 3]) ; insert 4 rows"
  [rang]
  (jdbc/execute! *conn* [(insert-range-sql rang)])
  (sync/sync-database! (data/db)))
