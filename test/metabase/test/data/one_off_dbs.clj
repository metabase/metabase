(ns metabase.test.data.one-off-dbs
  "Test utility functions for using one-off temporary in-memory H2 databases, including completely blank ones and the
  infamous `blueberries_consumed` database, used by sync tests in several different namespaces."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.database :refer [Database]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:dynamic *conn*
  "Bound to a JDBC connection spec when using one of the `with-db` macros below."
  nil)

;;; ---------------------------------------- Generic Empty Temp In-Memory DB -----------------------------------------

(defn do-with-blank-db
  "Impl for `with-blank-db` macro; prefer that to using this directly."
  [thunk]
  (let [details {:db (str "mem:" (mt/random-name) ";DB_CLOSE_DELAY=10")}]
    (t2.with-temp/with-temp [Database db {:engine :h2, :details details}]
      (data/with-db db
        (sql-jdbc.execute/do-with-connection-with-options
         :h2
         (mdb/spec :h2 details)
         {:write? true}
         (fn [^java.sql.Connection conn]
           (binding [*conn* {:connection conn}]
             (thunk))))))))

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
    (jdbc/execute! *conn* ["CREATE TABLE blueberries_consumed (str TEXT NOT NULL);"])
    (f)))

(defmacro with-blueberries-db
  "Creates a database with a single table, `blueberries_consumed`, with one column, `str`."
  {:style/indent 0}
  [& body]
  `(do-with-blueberries-db (fn [] ~@body)))


;;; ------------------------------------ Helper Fns for Populating Blueberries DB ------------------------------------

(defn range-str
  "Like range but each element is a string.
  We also sort the list because select distinct will also do sort automatically."
  [& args]
  (->> (apply range args)
      (map str)
      sort))

(defn- insert-sql
  "Generate SQL to insert a row for each value in `values`."
  [values]
  (str "INSERT INTO blueberries_consumed (str) VALUES "
       (str/join ", " (for [v values]
                        (str "('" v "')")))))

(defn insert-rows-and-sync!
  "With the temp blueberries db from above, insert a collection of values and re-sync the DB.

     (insert-rows-and-sync! [0 1 2 3]) ; insert 4 rows"
  [values]
  (jdbc/execute! *conn* [(insert-sql values)])
  (sync/sync-database! (data/db)))
