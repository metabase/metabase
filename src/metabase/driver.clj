(ns metabase.driver
  (:require clojure.java.classpath
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [medley.core :refer :all]
            [metabase.db :refer [exists? ins sel upd]]
            (metabase.driver [interface :as i]
                             [query-processor :as qp])
            (metabase.models [database :refer [Database]]
                             [query-execution :refer [QueryExecution]])
            [metabase.util :as u]))

(declare -dataset-query query-fail query-complete save-query-execution)

;; ## Constants

(def ^:const available-drivers
  "DB drivers that are available as a dictionary.  Each key is a driver with dictionary of attributes.
  ex: `:h2 {:id \"h2\" :name \"H2\"}`"
  {:h2       {:id   "h2"
              :name "H2"
              :example "file:[filename]"}
   :postgres {:id "postgres"
              :name "Postgres"
              :example "host=[ip address] port=5432 dbname=examples user=corvus password=******"}
   :mongo    {:id "mongo"
              :name "MongoDB"
              :example "mongodb://password:username@127.0.0.1:27017/db-name"}})

(def ^:const class->base-type
  "Map of classes returned from DB call to metabase.models.field/base-types"
  {java.lang.Boolean            :BooleanField
   java.lang.Double             :FloatField
   java.lang.Float              :FloatField
   java.lang.Integer            :IntegerField
   java.lang.Long               :IntegerField
   java.lang.String             :TextField
   java.math.BigDecimal         :DecimalField
   java.math.BigInteger         :BigIntegerField
   java.sql.Date                :DateField
   java.sql.Timestamp           :DateTimeField
   java.util.Date               :DateField
   java.util.UUID               :TextField
   org.postgresql.util.PGobject :UnknownField}) ; this mapping included here since Native QP uses class->base-type directly. TODO - perhaps make *class-base->type* driver specific?

;; ## Driver Lookup

(def ^{:arglists '([engine])} engine->driver
  "Return the driver instance that should be used for given ENGINE.
   This loads the corresponding driver if needed; it is expected that it resides in a var named

     metabase.driver.<engine>/driver

   i.e., the `:postgres` driver should be bound interned at `metabase.driver.postgres/driver`.

     (require ['metabase.driver.interface :as i])
     (i/active-table-names (engine->driver :postgres) some-pg-database)"
  (memoize
   (fn [engine]
     {:pre [(keyword? engine)]}
     (let [ns-symb (symbol (format "metabase.driver.%s" (name engine)))]
       (log/debug (format "Loading metabase.driver.%s..." (name engine)))
       (require ns-symb)
       (let [driver (some-> (ns-resolve ns-symb 'driver)
                            var-get)]
         (assert driver)
         (log/debug "Ok.")
         driver)))))

;; Can the type of a DB change?
(def ^{:arglists '([database-id])} database-id->driver
  "Memoized function that returns the driver instance that should be used for `Database` with ID.
   (Databases aren't expected to change their types, and this optimization makes things a lot faster).

   This loads the corresponding driver if needed."
  (memoize
   (fn [database-id]
     {:pre [(integer? database-id)]}
     (engine->driver (sel :one :field [Database :engine] :id database-id)))))


;; ## Implementation-Agnostic Driver API

(defn can-connect?
  "Check whether we can connect to DATABASE and perform a basic query (such as `SELECT 1`)."
  [database]
  {:pre [(map? database)]}
  (try
    (i/can-connect? (engine->driver (:engine database)) database)
    (catch Throwable e
      (log/error "Failed to connect to database:" (.getMessage e))
      false)))

(defn can-connect-with-details?
  "Check whether we can connect to a database with ENGINE and DETAILS-MAP and perform a basic query.
   Specify optional param RETHROW-EXCEPTIONS if you want to handle any exceptions thrown yourself
   (e.g., so you can pass the exception message along to the user).

     (can-connect-with-details? :postgres {:host \"localhost\", :port 5432, ...})"
  [engine details-map & [rethrow-exceptions]]
  {:pre [(keyword? engine)
         (contains? (set (keys available-drivers)) engine)
         (map? details-map)]}
  (try
    (i/can-connect-with-details? (engine->driver engine) details-map)
    (catch Throwable e
      (log/error "Failed to connect to database:" (.getMessage e))
      (when rethrow-exceptions
        (throw e))
      false)))

(def ^{:arglists '([database])} sync-database!
  "Sync a `Database`, its `Tables`, and `Fields`."
  (let [-sync-database! (u/runtime-resolved-fn 'metabase.driver.sync 'sync-database!)] ; these need to be resolved at runtime to avoid circular deps
    (fn [database]
      {:pre [(map? database)]}
      (time (-sync-database! (engine->driver (:engine database)) database)))))

(def ^{:arglists '([table])} sync-table!
  "Sync a `Table` and its `Fields`."
  (let [-sync-table! (u/runtime-resolved-fn 'metabase.driver.sync 'sync-table!)]
    (fn [table]
      {:pre [(map? table)]}
      (-sync-table! (database-id->driver (:db_id table)) table))))

(defn process-query
  "Process a structured or native query, and return the result."
  [query]
  {:pre [(map? query)]}
  (try
    (binding [qp/*query* query
              qp/*internal-context* (atom {})]
      (let [driver  (database-id->driver (:database query))
            query   (qp/preprocess query)
            results (binding [qp/*query* query]
                      (i/process-query driver (dissoc-in query [:query :cum_sum])))] ; strip out things that individual impls don't need to know about / deal with
        (qp/post-process driver query results)))
    (catch Throwable e
      (.printStackTrace e)
      {:status :failed
       :error  (.getMessage e)})))


;; ## Query Execution Stuff

(defn dataset-query
  "Process and run a json based dataset query and return results.

  Takes 2 arguments:

  1.  the json query as a dictionary
  2.  query execution options specified in a dictionary

  Depending on the database specified in the query this function will delegate to a driver specific implementation.
  For the purposes of tracking we record each call to this function as a QueryExecution in the database.

  Possible caller-options include:

    :executed_by [int]               (user_id of caller)"
  {:arglists '([query options])}
  [query {:keys [executed_by]
          :as options}]
  {:pre [(integer? executed_by)]}
  (let [query-execution {:uuid (.toString (java.util.UUID/randomUUID))
                         :executor_id executed_by
                         :json_query query
                         :query_id nil
                         :version 0
                         :status :starting
                         :error ""
                         :started_at (u/new-sql-timestamp)
                         :finished_at (u/new-sql-timestamp)
                         :running_time 0
                         :result_rows 0
                         :result_file ""
                         :result_data "{}"
                         :raw_query ""
                         :additional_info ""}]
    (let [query-execution (assoc query-execution :start_time_millis (System/currentTimeMillis))]
      (try
        (let [query-result (process-query query)]
          (when-not (contains? query-result :status)
            (throw (Exception. "invalid response from database driver. no :status provided")))
          (when (= :failed (:status query-result))
            (throw (Exception. ^String (get query-result :error "general error"))))
          (query-complete query-execution query-result))
        (catch Exception ex
          (log/warn ex)
          (.printStackTrace ex)
          (query-fail query-execution (.getMessage ex)))))))

(defn query-fail
  "Save QueryExecution state and construct a failed query response"
  [query-execution error-message]
  (let [updates {:status :failed
                 :error error-message
                 :finished_at (u/new-sql-timestamp)
                 :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))}]
    ;; record our query execution and format response
    (-> query-execution
        (dissoc :start_time_millis)
        (merge updates)
        (save-query-execution)
        ;; this is just for the response for clien
        (assoc :error error-message
               :row_count 0
               :data {:rows []
                      :cols []
                      :columns []}))))

(defn query-complete
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  ;; record our query execution and format response
  (-> (u/assoc* query-execution
                   :status :completed
                   :finished_at (u/new-sql-timestamp)
                   :running_time (- (System/currentTimeMillis) (:start_time_millis <>))
                   :result_rows (get query-result :row_count 0))
      (dissoc :start_time_millis)
      (save-query-execution)
      ;; at this point we've saved and we just need to massage things into our final response format
      (select-keys [:id :uuid])
      (merge query-result)))

(defn save-query-execution
  [{:keys [id] :as query-execution}]
  (if id
    ;; execution has already been saved, so update it
    (do
      (mapply upd QueryExecution id query-execution)
      query-execution)
    ;; first time saving execution, so insert it
    (mapply ins QueryExecution query-execution)))
