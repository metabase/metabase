(ns metabase-enterprise.security-center.read-only-connections
  "The work of the `read-only-connections` health check: [[refresh]] asks the databases, and [[items]] turns the stored
  answer into the items of the check."
  (:require
   [com.climate.claypoole :as cp]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [next.jdbc :as next.jdbc]
   [next.jdbc.result-set :as next.jdbc.rs])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(mr/def ::result
  "What the refresh found for one database. `\"role-writable\"`: the connection user can't write, but it can switch to
  a role that can."
  [:enum "read-only" "writable" "role-writable" "no-privileges" "not-supported" "timed-out" "error"])

(mr/def ::stored
  "What [[refresh]] returns and the setting holds for this check. The map is closed, so connection details cannot
  get into the setting. Every value is the same before and after the JSON round trip."
  [:map {:closed true}
   [:databases [:sequential [:map {:closed true}
                             [:id     ms/PositiveInt]
                             [:name   :string]
                             [:engine :string]
                             [:result ::result]]]]])

(def ^:private supported-engines
  ;; an explicit set, not the driver feature `:table-privileges`: MySQL has the privileges method and declares the
  ;; feature false
  #{:postgres :mysql :oracle :sqlserver :sqlite})

(def ^:private timeout-ms
  "The limit for one database, and for the whole refresh."
  30000)

(def ^:private max-pool-size
  ;; The refresh opens its connections outside the connection pools, and many databases can be on one server. The cap
  ;; limits the threads of the refresh and the connections that one server gets from it at the same moment.
  10)

(defn- table-privileges
  [engine conn]
  ;; `vec` reads every row now: the privilege method may return a lazy sequence, and the caller then switches the
  ;; connection to a role or closes it
  (vec (sql-jdbc.sync/current-user-table-privileges engine {:connection conn})))

(defn- writable?
  [rows]
  (boolean (some (some-fn :insert :update :delete) rows)))

(defn- role-names
  [conn sql]
  (mapv :name (next.jdbc/execute! conn [sql] {:builder-fn next.jdbc.rs/as-unqualified-lower-maps})))

(defn- switchable-roles
  "The names of the roles that the connection user of `conn` can switch to with [[driver/set-role!]] and whose
  privileges it does not hold without the switch."
  [engine ^Connection conn]
  (case engine
    :postgres
    ;; from Postgres 16 a membership grants `SET ROLE` on its own; before 16 every member can switch
    (let [can-switch (if (>= (.getDatabaseMajorVersion (.getMetaData conn)) 16) "SET" "MEMBER")]
      (role-names conn (str "SELECT rolname AS name FROM pg_catalog.pg_roles"
                            " WHERE pg_catalog.pg_has_role(current_user, oid, '" can-switch "')"
                            ;; `USAGE`: the role's privileges count without `SET ROLE`, so the privileges of the
                            ;; connection user already include them
                            " AND NOT pg_catalog.pg_has_role(current_user, oid, 'USAGE')")))
    ;; `EXECUTE AS USER` switches to another database user, whose permissions are not part of the connection user's
    :sqlserver
    (role-names conn (str "SELECT name FROM sys.database_principals"
                          " WHERE type IN ('S', 'U', 'E') AND name <> USER_NAME()"
                          " AND HAS_PERMS_BY_NAME(name, 'USER', 'IMPERSONATE') = 1"))
    ;; the MySQL privilege query already counts every role granted to the connection user; the other engines have no
    ;; roles that Metabase switches to
    []))

(defn- writable-role
  [{:keys [id engine]} conn]
  (some (fn [role]
          (when (try
                  (driver/set-role! engine conn role)
                  true
                  (catch Exception e
                    ;; a query as this connection user can't switch to the role either
                    (log/warnf e "Health check read-only-connections could not switch database %d (%s) to the role %s"
                               id (name engine) role)
                    false))
            (when (writable? (table-privileges engine conn))
              ;; the items don't name the role, so the log is where an admin finds it
              (log/warnf "Health check read-only-connections: database %d (%s) can write as the role %s"
                         id (name engine) role)
              role)))
        (switchable-roles engine conn)))

(defn- privileges-result
  [{:keys [engine] :as database}]
  ;; ends a read that the database never answers, so the thread and the connection are free again
  (binding [driver.settings/*network-timeout-ms* timeout-ms]
    ;; not a pooled connection: the check must also work for a database whose pool refuses connections. The new
    ;; connection also starts with no role set, and it closes after the check, so no role needs a reset.
    (sql-jdbc/do-with-new-connection
     database
     (fn [conn]
       (let [rows (table-privileges engine conn)]
         (cond
           ;; one identity that can write is enough: the roles are not read
           (writable? rows)                 "writable"
           (writable-role database conn)    "role-writable"
           ;; no rows says nothing about the user: the database has no tables, or the driver could not read the
           ;; privileges, as for MariaDB
           (empty? rows)                    "no-privileges"
           :else                            "read-only"))))))

(defn- check-database
  "The result for one database: `\"read-only\"`, `\"writable\"`, `\"role-writable\"`, `\"no-privileges\"` when the
  database lists no table privileges, or `\"error\"` when the database could not be asked."
  [{:keys [id engine] :as database}]
  (try
    (let [result (privileges-result database)]
      (when (= result "no-privileges")
        (log/warnf "Health check read-only-connections could not read the table privileges of database %d (%s)"
                   id (name engine)))
      result)
    (catch Throwable e
      ;; the message of a connection error can hold the host or the user, so it stays in the log
      (log/warnf e "Health check read-only-connections could not check database %d (%s)" id (name engine))
      "error")))

(defn- mariadb?
  ;; a MariaDB database has the engine `:mysql`; the version that sync stores names the server
  [{:keys [engine dbms_version]}]
  (and (= engine :mysql)
       (= (:flavor dbms_version) "MariaDB")))

(defn- stored-engine
  ;; the engine of a stored result and of a log line, with MariaDB told apart from MySQL
  [database]
  (if (mariadb? database) "mariadb" (name (:engine database))))

(defn- supported?
  [{:keys [engine] :as database}]
  (and (contains? supported-engines engine)
       ;; the MySQL privileges method returns no rows on MariaDB, for every user
       (not (mariadb? database))))

(defn- check-databases
  "The result for each of `databases`, in order. Runs `check-fn` for the databases with a supported engine on a pool of
  `threads` threads, and waits `limit-ms` for all of them together. A database without an answer by then gets
  `\"timed-out\"`."
  [databases check-fn threads limit-ms]
  (cp/with-shutdown! [pool (cp/threadpool threads)]
    (let [deadline (+ (System/nanoTime) (* limit-ms 1000000))
          futures  (mapv (fn [database]
                           (when (supported? database)
                             (cp/future pool (check-fn database))))
                         databases)]
      (mapv (fn [{:keys [id] :as database} fut]
              (if fut
                (let [result (deref fut (max 0 (quot (- deadline (System/nanoTime)) 1000000)) "timed-out")]
                  (when (= result "timed-out")
                    (log/warnf "Health check read-only-connections got no answer from database %d (%s) in %d ms"
                               id (stored-engine database) limit-ms))
                  result)
                (do
                  ;; info, not warn: the engine of a database does not change, so the line repeats on every refresh
                  (log/infof "Health check read-only-connections does not support database %d (%s)"
                             id (stored-engine database))
                  "not-supported")))
            databases
            futures))))

(defn- pool-size
  [databases]
  (-> (count (filter supported? databases))
      (min max-pool-size)
      (max 1)))

(mu/defn refresh :- ::stored
  "Asks every database in Admin → Databases, routing destinations included, whether its connection user, or a role
  that the connection user can switch to, can insert, update or delete. Returns the value to store. Takes at most 30
  seconds."
  []
  (let [timer     (u/start-timer)
        databases (security-center.db/databases-with-details)
        results   (check-databases databases check-database (pool-size databases) timeout-ms)]
    (log/infof "Health check read-only-connections checked %d databases in %.0f ms: %s"
               (count databases) (u/since-ms timer) (frequencies results))
    {:databases (mapv (fn [database result]
                        (-> (select-keys database [:id :name])
                            (assoc :engine (stored-engine database)
                                   :result result)))
                      databases
                      results)}))

(defn- engine-name
  [engine]
  (or (when (= engine "mariadb")
        "MariaDB")
      (try
        (driver/display-name (keyword engine))
        (catch Exception _
          nil))
      engine))

(defn- item
  [{db-id :id, db-name :name, :keys [engine result]}]
  (let [;; SQLite has no users: a write works or fails by the mode the file is opened in
        sqlite?          (= engine "sqlite")
        [status message] (case result
                           "read-only"     [:pass (if sqlite?
                                                    (tru "Metabase opens {0} read-only" db-name)
                                                    (tru "The connection user of {0} can''t write" db-name))]
                           "writable"      [:fail (if sqlite?
                                                    (tru "SQLite has no read-only users. Move the data of {0} to another database engine." db-name)
                                                    (tru "The connection user of {0} can insert, update or delete" db-name))]
                           "role-writable" [:fail (tru "The connection user of {0} can switch to a role that can insert, update or delete" db-name)]
                           "no-privileges" [:unknown (tru "Couldn''t read the privileges of the connection user of {0}" db-name)]
                           "not-supported" [:unknown (tru "{0} is not supported" (engine-name engine))]
                           "timed-out"     [:unknown (tru "Timed out after 30 s")]
                           [:unknown (tru "Couldn''t check {0}. Check the server logs for the underlying error." db-name)])]
    {:status      status
     :message     message
     :entity_type :database
     :entity_id   db-id
     :entity_name db-name}))

(mu/defn items :- [:sequential {:min 1} ::security-center.schema/health-check-item]
  "The items of the check from `stored`, the value that [[refresh]] returned, read back from the JSON setting; nil
  until a refresh has run. One item per database."
  [stored :- [:maybe ::stored]]
  (cond
    (nil? stored)                [{:status :unknown, :message (tru "Not checked yet")}]
    (empty? (:databases stored)) [{:status :pass, :message (tru "There are no databases to check")}]
    :else                        (mapv item (:databases stored))))
