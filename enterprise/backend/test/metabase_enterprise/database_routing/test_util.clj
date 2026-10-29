(ns metabase-enterprise.database-routing.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]))

(defmacro with-temp-dbs!
  "Creates databases like `mt/with-temp`, but creating an actual underlying H2 database with a single table,
  `my_database_name`, with a single column, `str`."
  [bindings & body]
  (letfn [(wrap [names body]
            (if (empty? names)
              `(do ~@body)
              `(one-off-dbs/with-blank-db
                 (let [~(first names) (data/db)]
                   (doseq [statement# ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                                       "SET DB_CLOSE_DELAY -1;"
                                       "CREATE TABLE \"my_database_name\" (str TEXT NOT NULL);"
                                       "GRANT ALL ON \"my_database_name\" TO GUEST;"]]
                     (jdbc/execute! one-off-dbs/*conn* [statement#]))
                   ~(wrap (rest names) body)))))]
    (wrap bindings body)))

(defn execute-statement!
  "Run the SQL `statement` against the H2 database `db`."
  [db statement]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2
   (mdb/spec :h2 (:details db))
   {:write? true}
   (fn [^java.sql.Connection conn]
     (jdbc/execute! {:connection conn} [statement]))))

(defmacro with-routing-setup!
  "Stands up a router + destination databases for a routing test.

  - `router-binding` → a synced `:model/Database` (real H2, `my_database_name` table). Owns the
    metadata; queries compile against it.
  - Each destination → a `[binding name]` pair. `binding` → a `:model/Database` with its own real H2 DB,
    inserted with `:router_database_id` set, not synced.
      - inserted, not flipped: `router_database_id` is immutable after insert.
      - not synced: routing runs the router-compiled SQL against the destination's connection.
      - `name` must equal the user's routing attribute: destinations resolve by name.
  - Caller wires the `:model/DatabaseRouter` and attributes. Each destination binding is a usable DB map.

    (with-routing-setup! [router-db [[dest-1 \"destination-db-1\"]
                                     [dest-2 \"destination-db-2\"]]]
      ...)"
  {:style/indent 1}
  [[router-binding destinations] & body]
  (letfn [(wrap-destinations [dests body]
            (if (empty? dests)
              `(do ~@body)
              (let [[sym name] (first dests)]
                ;; Real H2 DB for this destination, via `with-blank-db`. Discard the normal DB row it
                ;; registers; the destination is a separate row, inserted prod-shaped below.
                `(one-off-dbs/with-blank-db
                   (let [details# (:details (data/db))]
                     (doseq [statement# ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                                         "SET DB_CLOSE_DELAY -1;"
                                         "CREATE TABLE \"my_database_name\" (str TEXT NOT NULL);"
                                         "GRANT ALL ON \"my_database_name\" TO GUEST;"]]
                       (jdbc/execute! one-off-dbs/*conn* [statement#]))
                     (mt/with-temp [:model/Database ~sym
                                    {:engine             :h2
                                     :name               ~name
                                     :details            details#
                                     :router_database_id (u/the-id ~router-binding)}]
                       ~(wrap-destinations (rest dests) body)))))))]
    ;; Router: a normal synced DB, exactly as `with-temp-dbs!` builds one.
    `(with-temp-dbs! [~router-binding]
       (sync/sync-database! (:id ~router-binding))
       ~(wrap-destinations destinations body))))
