(ns metabase.driver
  (:require [clojure.data.json :as json]
            [clojure.tools.logging :as log]
            [medley.core :refer :all]
            [metabase.db :refer [exists? ins sel upd]]
            (metabase.driver [result :as result])
            (metabase.models [database :refer [Database]]
                             [query-execution :refer [QueryExecution]])
            [metabase.util :as util]))


(def available-drivers
  "DB drivers that are available (pairs of `[namespace user-facing-name]`)."
  [["h2" "H2"]                 ; TODO it would be very nice if we could just look for files in this namespace at runtime and load them
   ["postgres" "PostgreSQL"]]) ; then the driver dispatch functions wouldn't have to call `require`


(defn db-dispatch-fn
  "Returns a dispatch fn for multi-methods that keys off of a `Database's` `:engine`.

   The correct driver implementation is loaded dynamically to avoid having to require the files elsewhere in the codebase.
   IMPL-NAMESPACE is the namespace we should load relative to the driver, e.g.

    (defmulti my-multimethod (db-dispatch-fn \"metadata\"))

   Would load `metabase.driver.postgres.metadata` for a `Database` whose `:engine` was `:postgres`."
  [impl-namespace]
  (fn [{:keys [engine]}]
    {:pre [engine]}
    (require (symbol (str "metabase.driver." engine "." impl-namespace)))
    (keyword engine)))


(defmulti process-and-run
  "Process a query of type `query` (implemented by various DB drivers)."
  (fn [{:keys [database] :as query}]
    ((db-dispatch-fn "query-processor") (sel :one [Database :engine] :id database))))


(defn- execute-query
  "Process and run a query and return results."
  [{:keys [type] :as query}]
  (case (keyword type)
    :native (process-and-run query)
    :query (process-and-run query)
    :result (result/process-and-run query)))


(defmulti connection-details
  "Return a map of connection details (in format usable by korma) for DATABASE."
  (db-dispatch-fn "connection"))

(defmulti connection
  "Return a korma connection to DATABASE."
  (db-dispatch-fn "connection"))

(defmulti sync-database
  "Update the metadata for ALL `Tables` within a given DATABASE, creating new `Tables` if they don't already exist.
  (This is executed in parallel.)"
  (db-dispatch-fn "sync"))

(defmulti sync-table
  "Update the metadata for a SINGLE `Table`, creating it if it doesn't already exist.
  (This is executed in parallel.)"
  (db-dispatch-fn "sync"))

(declare -dataset-query query-fail query-complete save-query-execution)

(defn dataset-query
  "Process and run a json based dataset query and return results.

   Takes 2 arguments:
   1.  the json query as a dictionary
   2.  query execution options specified in a dictionary

   Depending on the database specified in the query this function will delegate to a driver specific implementation.
   For the purposes of tracking we record each call to this function as a QueryExecution in the database.

   Possible caller-options include:
     :executed_by [int]               (user_id of caller)
     :saved_query [{}]                (dictionary representing Query model)
     :synchronously [true|false]      (default true)
     :cache_result [true|false]       (default false)
  "
  {:arglists '([query caller-options])}
  [query {:keys [executed_by synchronously saved_query]
          :or {synchronously true}
          :as caller-options}]
  {:pre [(integer? executed_by)]}
  (let [options (merge {:cache_result false} caller-options)
        query-execution {:uuid (.toString (java.util.UUID/randomUUID))
                         :executor_id executed_by
                         :json_query query
                         :query_id (:id saved_query)
                         :version (get saved_query :version 0)
                         :status "starting"
                         :error ""
                         :started_at (util/new-sql-timestamp)
                         :finished_at (util/new-sql-timestamp)
                         :running_time 0
                         :result_rows 0
                         :result_file ""
                         :result_data "{}"
                         :raw_query ""
                         :additional_info ""}]
    (if synchronously
      (-dataset-query query options query-execution)
      ;; TODO - this is untested/used.  determine proper way to place execution on background thread
      (let [query-execution (-> (save-query-execution query-execution)
                                ;; this is a bit lame, but to avoid having the delay fns in the dictionary we are
                                ;; trimming them right here.  maybe there is a better way?
                                (select-keys [:id :uuid :executor :query_id :version :status :started_at]))]
        ;; run the query, but do it on another thread
        (future (-dataset-query query options query-execution))
        ;; this ensures the currently saved query-execution is what gets returned
        query-execution))))


(defn -dataset-query
  "Execute a query and record the outcome.  Entire execution is wrapped in a try-catch to prevent Exceptions
   from leaking outside the function call."
  [query options query-execution]
  (let [query-execution (assoc query-execution :start_time_millis (System/currentTimeMillis))]
    (try
      (let [query-result (execute-query query)]
        (when-not (contains? query-result :status) (throw (Exception. "invalid response from database driver. no :status provided")))
        (when (= :failed (:status query-result)) (throw (Exception. ^String (get query-result :error "general error"))))
        (query-complete query-execution query-result (:cache_result options)))
      (catch Exception ex
        (log/warn ex)
        (query-fail query-execution (.getMessage ex))))))


(defn query-fail
  "Save QueryExecution state and construct a failed query response"
  [query-execution msg]
  (let [updates {:status "failed"
                 :error msg
                 :finished_at (util/new-sql-timestamp)
                 :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))}]
    ;; record our query execution and format response
    (-> query-execution
      (dissoc :start_time_millis)
      (merge updates)
      (save-query-execution)
      ;; this is just for the response for clien
      (assoc :row_count 0
             :data {:rows []
                    :cols []
                    :columns []}))))

(defn query-complete
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result cache-result]
  ;; record our query execution and format response
  (-> (util/assoc* query-execution
                   :status "completed"
                   :finished_at (util/new-sql-timestamp)
                   :running_time (- (System/currentTimeMillis) (:start_time_millis <>))
                   :result_rows (get query-result :row_count 0)
                   :result_data (if cache-result
                                  (json/write-str (:data query-result))
                                  "{}"))
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
