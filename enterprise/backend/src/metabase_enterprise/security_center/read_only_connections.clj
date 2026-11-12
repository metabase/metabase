(ns metabase-enterprise.security-center.read-only-connections
  "The work of the `read-only-connections` health check: [[refresh]] asks every database whether its connection user
  can write, and [[items]] turns the stored answer into the items of the check."
  (:require
   [com.climate.claypoole :as cp]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private supported-engines
  ;; an explicit set, not the driver feature `:table-privileges`: MySQL has the privileges method and declares the
  ;; feature false
  #{:postgres :mysql :oracle :sqlserver})

(def ^:private timeout-ms
  "The limit for one database, and for the whole refresh."
  30000)

(def ^:private max-pool-size
  ;; The refresh opens its connections outside the connection pools, and many databases can be on one server. The cap
  ;; limits the threads of the refresh and the connections that one server gets from it at the same moment.
  10)

(defn- privileges-result
  [{:keys [engine details]}]
  ;; ends a read that the database never answers, so the thread and the connection are free again
  (let [rows (binding [driver.settings/*network-timeout-ms* timeout-ms]
               (sql-jdbc/current-user-table-privileges-with-details engine details))]
    (cond
      ;; no rows says nothing about the user: the database has no tables, or the driver could not read the
      ;; privileges, as for MariaDB
      (empty? rows)                                 "no-privileges"
      (some (some-fn :insert :update :delete) rows) "writable"
      :else                                         "read-only")))

(defn- check-database
  "The result for one database: `\"read-only\"`, `\"writable\"`, `\"no-privileges\"` when the database lists no table
  privileges, or `\"error\"` when the database could not be asked."
  [{:keys [id engine] :as database}]
  (try
    (privileges-result database)
    (catch Throwable e
      ;; the message of a connection error can hold the host or the user, so it stays in the log
      (log/warnf e "Health check read-only-connections could not check database %d (%s)" id (name engine))
      "error")))

(defn- mariadb?
  ;; a MariaDB database has the engine `:mysql`; the version that sync stores names the server
  [{:keys [engine dbms_version]}]
  (and (= engine :mysql)
       (= (:flavor dbms_version) "MariaDB")))

(defn- supported?
  [{:keys [engine] :as database}]
  (and (contains? supported-engines engine)
       ;; the MySQL privileges method returns no rows on MariaDB, for every user
       (not (mariadb? database))))

(defn- check-databases
  "The result for each of `databases`, in order. Runs `check-fn` for the databases with a supported engine on a pool of
  `pool-size` threads, and waits `timeout-ms` for all of them together. A database without an answer by then gets
  `\"timed-out\"`."
  [databases check-fn pool-size timeout-ms]
  (cp/with-shutdown! [pool (cp/threadpool pool-size)]
    (let [deadline (+ (System/nanoTime) (* timeout-ms 1000000))
          futures  (mapv (fn [database]
                           (when (supported? database)
                             (cp/future pool (check-fn database))))
                         databases)]
      (mapv (fn [{:keys [id engine]} fut]
              (if fut
                (let [result (deref fut (max 0 (quot (- deadline (System/nanoTime)) 1000000)) "timed-out")]
                  (when (= result "timed-out")
                    (log/warnf "Health check read-only-connections got no answer from database %d (%s) in %d ms"
                               id (name engine) timeout-ms))
                  result)
                "not-supported"))
            databases
            futures))))

(defn- pool-size
  [databases]
  (-> (count (filter supported? databases))
      (min max-pool-size)
      (max 1)))

(defn refresh
  "Asks every database in Admin → Databases, routing destinations included, whether its connection user can insert,
  update or delete. Returns the value to store: `{:databases [{:id :name :engine :result}]}`, with no connection
  details. Takes at most 30 seconds."
  []
  (let [timer     (u/start-timer)
        databases (security-center.db/databases-with-details)
        results   (check-databases databases check-database (pool-size databases) timeout-ms)]
    (log/infof "Health check read-only-connections checked %d databases in %.0f ms: %s"
               (count databases) (u/since-ms timer) (frequencies results))
    {:databases (mapv (fn [database result]
                        (-> (select-keys database [:id :name])
                            (assoc :engine (if (mariadb? database) "mariadb" (name (:engine database)))
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
  (let [[status message] (case result
                           "read-only"     [:pass (tru "The connection user of {0} can''t write" db-name)]
                           "writable"      [:fail (tru "The connection user of {0} can insert, update or delete" db-name)]
                           "no-privileges" [:unknown (tru "Couldn''t read the privileges of the connection user of {0}" db-name)]
                           "not-supported" [:unknown (tru "{0} is not supported" (engine-name engine))]
                           "timed-out"     [:unknown (tru "Timed out after 30 s")]
                           [:unknown (tru "Couldn''t check {0}. Check the server logs for the underlying error." db-name)])]
    {:status      status
     :message     message
     :entity_type :database
     :entity_id   db-id
     :entity_name db-name}))

(defn items
  "The items of the check from `stored`, the value that [[refresh]] returned, read back from the JSON setting; nil
  until a refresh has run. One item per database."
  [stored]
  (cond
    (nil? stored)                [{:status :unknown, :message (tru "Not checked yet")}]
    (empty? (:databases stored)) [{:status :pass, :message (tru "There are no databases to check")}]
    :else                        (mapv item (:databases stored))))
