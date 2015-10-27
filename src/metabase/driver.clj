(ns metabase.driver
  (:require clojure.java.classpath
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [medley.core :as m]
            [metabase.db :refer [ins sel upd]]
            [metabase.driver.query-processor :as qp]
            (metabase.models [database :refer [Database]]
                             [query-execution :refer [QueryExecution]])
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]))

(declare -dataset-query query-fail query-complete save-query-execution)

;;; ## CONFIG

(defsetting report-timezone "Connection timezone to use when executing queries. Defaults to system timezone.")

;; ## Constants

(def available-drivers
  "Delay to a map of info about available drivers."
  (delay (->> (for [namespace (->> (ns-find/find-namespaces (clojure.java.classpath/classpath))
                                   (filter (fn [ns-symb]
                                             (re-matches #"^metabase\.driver\.[a-z0-9_]+$" (name ns-symb)))))]
                (do (require namespace)
                    (->> (ns-publics namespace)
                         (map (fn [[symb varr]]
                                (when (::driver (meta varr))
                                  {(keyword symb) (select-keys @varr [:details-fields
                                                                      :driver-name
                                                                      :features])})))
                         (into {}))))
              (into {}))))

(defn is-engine?
  "Is ENGINE a valid driver name?"
  [engine]
  (when engine
    (contains? (set (keys @available-drivers)) (keyword engine))))

(defn class->base-type
  "Return the `Field.base_type` that corresponds to a given class returned by the DB."
  [klass]
  (or ({Boolean                         :BooleanField
        Double                          :FloatField
        Float                           :FloatField
        Integer                         :IntegerField
        Long                            :IntegerField
        String                          :TextField
        java.math.BigDecimal            :DecimalField
        java.math.BigInteger            :BigIntegerField
        java.sql.Date                   :DateField
        java.sql.Timestamp              :DateTimeField
        java.util.Date                  :DateField
        java.util.UUID                  :TextField
        org.postgresql.util.PGobject    :UnknownField} klass)
      (cond
        (isa? klass clojure.lang.IPersistentMap) :DictionaryField)
      (do (log/warn (format "Don't know how to map class '%s' to a Field base_type, falling back to :UnknownField." klass))
          :UnknownField)))

;; ## Driver Lookup

(defn engine->driver
  "Return the driver instance that should be used for given ENGINE.
   This loads the corresponding driver if needed; it is expected that it resides in a var named

     metabase.driver.<engine>/<engine>"
  [engine]
  (let [nmspc (symbol (format "metabase.driver.%s" (name engine)))]
    (require nmspc)
    @(ns-resolve nmspc (symbol (name engine)))))


;; Can the type of a DB change?
(def ^{:arglists '([database-id])} database-id->driver
  "Memoized function that returns the driver instance that should be used for `Database` with ID.
   (Databases aren't expected to change their types, and this optimization makes things a lot faster).

   This loads the corresponding driver if needed."
  (let [db-id->engine (memoize
                       (fn [db-id]
                         (sel :one :field [Database :engine] :id db-id)))]
    (fn [db-id]
      (engine->driver (db-id->engine db-id)))))


;; ## Implementation-Agnostic Driver API

(defn can-connect?
  "Check whether we can connect to DATABASE and perform a basic query (such as `SELECT 1`)."
  [database]
  {:pre [(map? database)]}
  (let [driver (engine->driver (:engine database))]
    (try
      ((:can-connect? driver) (:details database))
      (catch Throwable e
        (log/error "Failed to connect to database:" (.getMessage e))
        false))))

(defn can-connect-with-details?
  "Check whether we can connect to a database with ENGINE and DETAILS-MAP and perform a basic query.
   Specify optional param RETHROW-EXCEPTIONS if you want to handle any exceptions thrown yourself
   (e.g., so you can pass the exception message along to the user).

     (can-connect-with-details? :postgres {:host \"localhost\", :port 5432, ...})"
  [engine details-map & [rethrow-exceptions]]
  {:pre [(keyword? engine)
         (is-engine? engine)
         (map? details-map)]}
  (let [{:keys [can-connect? humanize-connection-error-message]} (engine->driver engine)]
    (try
      (can-connect? details-map)
      (catch Throwable e
        (log/error "Failed to connect to database:" (.getMessage e))
        (when rethrow-exceptions
          (let [^String message ((or humanize-connection-error-message
                                     identity)
                                 (.getMessage e))]
            (throw (Exception. message))))
        false))))

(def ^{:arglists '([database])} sync-database!
  "Sync a `Database`, its `Tables`, and `Fields`."
  (let [-sync-database! (u/runtime-resolved-fn 'metabase.driver.sync 'sync-database!)] ; these need to be resolved at runtime to avoid circular deps
    (fn [database]
      {:pre [(map? database)]}
      (-sync-database! (engine->driver (:engine database)) database))))

(def ^{:arglists '([table])} sync-table!
  "Sync a `Table` and its `Fields`."
  (let [-sync-table! (u/runtime-resolved-fn 'metabase.driver.sync 'sync-table!)]
    (fn [table]
      {:pre [(map? table)]}
      (-sync-table! (database-id->driver (:db_id table)) table))))

(defn process-query
  "Process a structured or native query, and return the result."
  [query]
  (qp/process (database-id->driver (:database query)) query))


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
  (let [query-execution {:uuid            (.toString (java.util.UUID/randomUUID))
                         :executor_id     executed_by
                         :json_query      query
                         :query_id        nil
                         :version         0
                         :status          :starting
                         :error           ""
                         :started_at      (u/new-sql-timestamp)
                         :finished_at     (u/new-sql-timestamp)
                         :running_time    0
                         :result_rows     0
                         :result_file     ""
                         :result_data     "{}"
                         :raw_query       ""
                         :additional_info ""}]
    (let [query-execution (assoc query-execution :start_time_millis (System/currentTimeMillis))]
      (try
        (let [query-result (process-query query)]
          (when-not (contains? query-result :status)
            (throw (Exception. "invalid response from database driver. no :status provided")))
          (when (= :failed (:status query-result))
            (throw (Exception. ^String (get query-result :error "general error"))))
          (query-complete query-execution query-result))
        (catch Exception e
          (query-fail query-execution (.getMessage e)))))))

(defn query-fail
  "Save QueryExecution state and construct a failed query response"
  [query-execution error-message]
  (let [updates {:status       :failed
                 :error        error-message
                 :finished_at  (u/new-sql-timestamp)
                 :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))}]
    ;; record our query execution and format response
    (-> query-execution
        (dissoc :start_time_millis)
        (merge updates)
        (save-query-execution)
        ;; this is just for the response for clien
        (assoc :error     error-message
               :row_count 0
               :data      {:rows    []
                           :cols    []
                           :columns []}))))

(defn query-complete
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  ;; record our query execution and format response
  (-> (u/assoc* query-execution
        :status       :completed
        :finished_at  (u/new-sql-timestamp)
        :running_time (- (System/currentTimeMillis) (:start_time_millis <>))
        :result_rows  (get query-result :row_count 0))
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
      (m/mapply upd QueryExecution id query-execution)
      query-execution)
    ;; first time saving execution, so insert it
    (m/mapply ins QueryExecution query-execution)))
