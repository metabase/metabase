(ns metabase-enterprise.transforms.util
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

(defn try-start-unless-already-running
  "Start a transform run, throwing an informative error if already running."
  [id run-method]
  (try
    (transform-run/start-run! id {:run_method run-method})
    (catch java.sql.SQLException e
      (if (= (.getSQLState e) "23505")
        (throw (ex-info "Transform is already running"
                        {:error :already-running
                         :transform-id id}
                        e))
        (throw e)))))

(defn run-cancelable-transform!
  "Execute a transform with cancellation support and proper error handling."
  [run-id driver {:keys [db-id conn-spec output-schema]} run-transform!]
  ;; local run is responsible for status, using canceling lifecycle
  (try
    (when-not (driver/schema-exists? driver db-id output-schema)
      (driver/create-schema-if-needed! driver conn-spec output-schema))
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (let [cancel-chan (a/promise-chan)
          ret (binding [qp.pipeline/*canceled-chan* cancel-chan]
                (canceling/chan-start-run! run-id cancel-chan)
                (run-transform! cancel-chan))]
      (transform-run/succeed-started-run! run-id)
      ret)
    (catch Throwable t
      (let [{:keys [transform-run-message]} (ex-data t)
            message (str/join "\n" (remove str/blank? [transform-run-message (.getMessage t)]))]
        (transform-run/fail-started-run! run-id {:message message}))
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

(declare activate-table-and-mark-computed!)

(defn sync-target!
  "Sync target of a transform"
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database _run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target) "for transform")
   (activate-table-and-mark-computed! database target)))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [source target] :as _transform}]
  (let [db-id (-> source :query :database)
        {driver :engine :as database} (t2/select-one :model/Database db-id)]
    (driver/table-exists? driver database target)))

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target & kv-args]
  (some-> (apply t2/select-one :model/Table
                 :db_id database-id
                 :schema (:schema target)
                 :name (:name target)
                 kv-args)
          (t2/hydrate :db)))

(defn- sync-table!
  ([database target] (sync-table! database target nil))
  ([database target {:keys [create?]}]
   (when-let [table (or (target-table (:id database) target)
                        (when create?
                          (sync/create-table! database (select-keys target [:schema :name]))))]
     (sync/sync-table! table)
     table)))

(defn activate-table-and-mark-computed!
  "Activate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target {:create? true})]
    (when (or (not (:active table)) (not (= (:data_authority table) :computed)))
      (t2/update! :model/Table (:id table) {:active true, :data_authority :computed}))))

(defn deactivate-table!
  "Deactivate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target)]
    ;; TODO this should probably be a function in the sync module
    (t2/update! :model/Table (:id table) {:active false})))

(defn delete-target-table!
  "Delete the target table of a transform and sync it from the app db."
  [{:keys [id target source], :as _transform}]
  (when target
    (let [target (update target :type keyword)
          database-id (-> source :query :database)
          {driver :engine :as database} (t2/select-one :model/Database database-id)]
      (driver/drop-transform-target! driver database target)
      (log/info "Deactivating  target " (pr-str target) "for transform" id)
      (deactivate-table! database target))))

(defn delete-target-table-by-id!
  "Delete the target table of the transform specified by `transform-id`."
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

(defn massage-sql-query
  "Adjusts mbql query for use in a transform."
  [query]
  (assoc-in query [:middleware :disable-remaps?] true))

(defn compile-source
  "Compile the source query of a transform."
  [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (massage-sql-query (:query source))))))

(defn required-database-feature
  "Returns the database feature necessary to execute `transform`."
  [transform]
  (case (-> transform :target :type)
    "table"             :transforms/table))

(defn ->instant
  "Convert a temporal value `t` to an Instant in the system timezone."
  ^Instant [t]
  (when t
    (condp instance? t
      Instant        t
      Date           (.toInstant ^Date t)
      OffsetDateTime (.toInstant ^OffsetDateTime t)
      ZonedDateTime  (.toInstant ^ZonedDateTime t)
      LocalDateTime  (recur (.atZone ^LocalDateTime t (t/zone-id)))
      String         (recur (u.date/parse t))
      LocalTime      (recur (.atDate ^LocalTime t (t/local-date)))
      OffsetTime     (recur (.atDate ^OffsetTime t (t/local-date)))
      LocalDate      (recur (.atStartOfDay ^LocalDate t))
      (throw (ex-info (str "Cannot convert temporal " t " of type " (type t) " to an Instant")
                      {:temporal t})))))

(defn utc-timestamp-string
  "Convert the timestamp t to a string encoding the it in the system timezone."
  [t]
  (-> t ->instant str))

(defn localize-run-timestamps
  "Convert the timestamps of a `run` to ISO strings in UTC."
  [run]
  (-> run
      (u/update-some :start_time utc-timestamp-string)
      (u/update-some :end_time   utc-timestamp-string)))

(defn db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database"
  [db-or-id]
  (or (t2/exists? :model/DatabaseRouter :database_id (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               (t2/exists? :model/DatabaseRouter :database_id))))
