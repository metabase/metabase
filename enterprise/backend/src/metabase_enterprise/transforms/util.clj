(ns metabase-enterprise.transforms.util
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

(def ^:const transform-temp-table-prefix
  "Prefix used for temporary tables created during transform execution."
  "mb_transform_temp_table")

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

(defn query-transform?
  "Check if this is a query transform: native query / mbql query."
  [transform]
  (= :query (-> transform :source :type keyword)))

(defn python-transform?
  "Check if this is a Python transform."
  [transform]
  (= :python (-> transform :source :type keyword)))

(defn check-feature-enabled
  "Checking whether we have proper feature flags for using a given transform."
  [transform]
  (if (python-transform? transform)
    (and (premium-features/has-feature? :transforms)
         (premium-features/has-feature? :transforms-python))
    (premium-features/has-feature? :transforms)))

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
  "Execute a transform with cancellation support and proper error handling.

  Options:
  - `:ex-message-fn` change how caught exceptions are presented to the user in run logs, by default the same as clojure.core/ex-message"
  [run-id driver {:keys [db-id conn-spec output-schema]} run-transform! & {:keys [ex-message-fn] :or {ex-message-fn ex-message}}]
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
      (transform-run/fail-started-run! run-id {:message (ex-message-fn t)})
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

;; TODO this and target-database-id can be transforms multimethods?
(defn target-database-id
  "Return the target database id of a transform"
  [transform]
  (if (python-transform? transform)
    (-> transform :target :database)
    (-> transform :source :query :database)))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [target] :as transform}]
  (let [db-id (target-database-id transform)
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
  [{:keys [id target], :as transform}]
  (when target
    (let [target (update target :type keyword)
          database-id (target-database-id transform)
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
  (case (keyword query-type)
    :query (:query (qp.compile/compile-with-inline-parameters (massage-sql-query (:query source))))))

(defn required-database-feature
  "Returns the database feature necessary to execute `transform`."
  [transform]
  (if (python-transform? transform)
    :transforms/python
    (case (-> transform :target :type)
      "table"             :transforms/table)))

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

(mr/def ::column-definition
  [:map
   [:name :string]
   [:type ::lib.schema.common/base-type]
   [:nullable? {:optional true} :boolean]])

(mr/def ::table-definition
  [:map
   [:name :keyword]
   [:columns [:sequential ::column-definition]]
   [:primary-key {:optional true} [:sequential :string]]])

(mu/defn create-table-from-schema!
  "Create a table from a table-schema"
  [driver :- :keyword
   database-id :- pos-int?
   table-schema :- ::table-definition]
  (let [{:keys [columns] table-name :name} table-schema
        column-definitions (into {} (map (fn [{:keys [name type database-type]}]
                                           (let [db-type (if database-type
                                                           [[:raw database-type]]
                                                           (try
                                                             (driver/type->database-type driver type)
                                                             (catch IllegalArgumentException _
                                                               (log/warnf "Couldn't determine database type for type %s, fallback to Text" type)
                                                               (driver/type->database-type driver :type/Text))))]
                                             [name db-type])))
                                 columns)
        primary-key-opts (select-keys table-schema [:primary-key])]
    (log/infof "Creating table %s with %d columns" table-name (count columns))
    (driver/create-table! driver database-id table-name column-definitions primary-key-opts)))

(defn drop-table!
  "Drop a table in the database."
  [driver database-id table-name]
  (log/infof "Dropping table %s" table-name)
  (driver/drop-table! driver database-id table-name))

(defn temp-table-name
  "Generate a temporary table name with current timestamp in milliseconds.
  If table name would exceed max table name length for the driver, fallback to using a shorter timestamp"
  [driver schema]
  (let [max-len   (max 1 (or (driver/table-name-length-limit driver) Integer/MAX_VALUE))
        timestamp (str (System/currentTimeMillis))
        prefix    (str transform-temp-table-prefix "_")
        available (- max-len (count prefix))
        ;; If we don't have enough space, take the later digits of the timestamp
        suffix    (if (>= available (count timestamp))
                    timestamp
                    (subs timestamp (- (count timestamp) available)))
        table-name (str prefix suffix)]
    (keyword schema table-name)))

(defn rename-tables!
  "Rename multiple tables atomically within a transaction using the new driver/rename-tables method.
   This is a simpler, composable operation that only handles renaming."
  [driver database-id rename-map]
  (log/infof "Renaming tables: %s" (pr-str rename-map))
  (driver/rename-tables! driver database-id rename-map))

(defenterprise is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  :feature :transforms
  [table]
  (when-let [table-name (:name table)]
    (str/starts-with? (u/lower-case-en table-name) transform-temp-table-prefix)))

(defn db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database"
  [db-or-id]
  (or (t2/exists? :model/DatabaseRouter :database_id (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               (t2/exists? :model/DatabaseRouter :database_id))))

(defn- matching-timestamp?
  [job field-path {:keys [start end]}]
  (when-let [field-instant (->instant (get-in job field-path))]
    (let [start-instant (some-> start u.date/parse ->instant)
          end-instant (some-> end u.date/parse ->instant)]
      (and (or (nil? start)
               (not (.isBefore field-instant start-instant)))
           (or (nil? end)
               (.isAfter end-instant field-instant))))))

(defn ->date-field-filter-xf
  "Returns an xform for a date filter."
  [field-path filter-value]
  (let [range (some-> filter-value (params.dates/date-string->range {:inclusive-end? false}))]
    (if range
      (filter #(matching-timestamp? % field-path range))
      identity)))

(defn ->status-filter-xf
  "Returns an xform for a transform run status filter."
  [field-path statuses]
  (let [statuses (->> statuses (map keyword) set not-empty)]
    (if statuses
      (filter #(statuses (get-in % field-path)))
      identity)))

(defn ->tag-filter-xf
  "Returns an xform for a transform tag filter."
  [field-path tag-ids]
  (let [tag-ids (-> tag-ids set not-empty)]
    (if tag-ids
      (filter #(some tag-ids (get-in % field-path)))
      identity)))
