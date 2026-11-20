(ns metabase-enterprise.security-center.read-only-connections
  "The work of the `read-only-connections` health check: [[refresh]] asks every database whether its connection user
  can write, and [[items]] turns the stored answer into the items of the check."
  (:require
   [com.climate.claypoole :as cp]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util.concurrent TimeoutException)))

(set! *warn-on-reflection* true)

(mr/def ::result
  "What the refresh found for one database. `\"roles-skipped\"`: the connection user can't write, but Metabase
  switches the connections of the database to database roles, and the check does not test those roles."
  [:enum "read-only" "writable" "roles-skipped" "no-privileges" "not-supported" "timed-out" "error"])

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

(def ^:private refresh-timeout-ms
  "The limit for the whole refresh. Each database also has its own limit,
  [[driver.settings/db-connection-timeout-ms]]."
  30000)

(def ^:private max-pool-size
  ;; The refresh opens its connections outside the connection pools, and many databases can be on one server. The cap
  ;; limits the threads of the refresh and the connections that one server gets from it at the same moment.
  10)

(defn- default-role?
  [{:keys [engine] :as database}]
  ;; a driver that needs no default role, such as Postgres with `NONE`, resets the connection to the connection user
  (and (driver.u/supports? engine :connection-impersonation-requires-role database)
       ;; a router has no destination to resolve here: the check connects to every database itself
       (some? (database-routing/with-anonymous-router-access
                (driver.sql/default-database-role engine (driver.u/ensure-lib-database database))))))

(defn- switches-roles?
  "Whether Metabase switches the connections of `database` to database roles: a connection impersonation policy applies
  to it, or its driver sets a default role on every connection."
  [{:keys [id engine router_database_id] :as database}]
  (and (driver.u/supports? engine :connection-impersonation database)
       (or (default-role? database)
           ;; a routing destination takes the policies of its router
           (security-center.db/impersonation-exists-for-database? (or router_database_id id)))))

(defn- privileges-result
  [database timeout-ms]
  ;; ends a read that the database never answers, so the thread and the connection are free again
  (let [rows (binding [driver.settings/*network-timeout-ms* timeout-ms]
               ;; not a pooled connection: the check must also work for a database whose pool refuses connections
               (sql-jdbc/do-with-unpooled-default-connection
                database
                (fn [conn]
                  ;; realized here: the rows may be lazy, and the connection closes when this function returns
                  (vec (sql-jdbc.sync/current-user-table-privileges (:engine database) {:connection conn})))))]
    (cond
      ;; no rows says nothing about the user: the database has no tables, or the driver could not read the
      ;; privileges, as for MariaDB
      (empty? rows)                                 "no-privileges"
      (some (some-fn :insert :update :delete) rows) "writable"
      (switches-roles? database)                    "roles-skipped"
      :else                                         "read-only")))

(defn- check-database
  "The result for one database: `\"read-only\"`, `\"writable\"`, `\"roles-skipped\"`, `\"no-privileges\"` when the
  database lists no table privileges, `\"timed-out\"` when it does not answer within
  [[driver.settings/db-connection-timeout-ms]], or `\"error\"` when the database could not be asked."
  [{:keys [id engine] :as database}]
  (try
    ;; the network timeout does not cover the connect: a host that drops packets can hold the connect, and so a thread
    ;; of the refresh, for as long as the driver allows. The future of `with-timeout` frees the thread at the limit,
    ;; and the connect ends in the background when the driver gives up.
    (let [timeout-ms (driver.settings/db-connection-timeout-ms)
          result     (try
                       (u/with-timeout timeout-ms
                         (privileges-result database timeout-ms))
                       (catch TimeoutException _
                         (log/warnf "Health check read-only-connections got no answer from database %d (%s) in %d ms"
                                    id (name engine) timeout-ms)
                         "timed-out"))]
      (when (= result "no-privileges")
        (log/warnf "Health check read-only-connections could not read the table privileges of database %d (%s)"
                   id (name engine)))
      result)
    (catch InterruptedException _
      ;; usually the refresh passed its deadline and shut its pool down, and it has already counted this database as
      ;; timed out; a server shutdown can also interrupt the thread
      (.interrupt (Thread/currentThread))
      "timed-out")
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
  "Asks every database in Admin → Databases, routing destinations included, whether its connection user can insert,
  update or delete. Returns the value to store. Takes at most 30 seconds."
  []
  (let [timer     (u/start-timer)
        databases (security-center.db/databases-with-details)
        results   (check-databases databases check-database (pool-size databases) refresh-timeout-ms)]
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
                           "roles-skipped" [:unknown (tru "Couldn''t check the database roles that Metabase uses on {0}" db-name)]
                           "no-privileges" [:unknown (tru "Couldn''t read the privileges of the connection user of {0}" db-name)]
                           "not-supported" [:unknown (tru "{0} is not supported" (engine-name engine))]
                           "timed-out"     [:unknown (tru "Timed out while checking {0}" db-name)]
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
