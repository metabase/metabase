(ns metabase.test.data.impl.get-or-create
  (:require
   [clojure.string :as str]
   [clojure.tools.reader.edn :as edn]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.humanization :as humanization]
   [metabase.models.permissions-group :as perms-group]
   [metabase.sync.core :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp])
  (:import
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

(defonce ^:private dataset-locks
  (atom {}))

(defonce ^:private session-init-time
  (t/offset-date-time))

(defmulti dataset-lock
  "We'll have a very bad time if any sort of test runs that calls [[metabase.test.data/db]] for the first time calls it
  multiple times in parallel -- for example my Oracle test that runs 30 sync calls at the same time to make sure
  nothing explodes and cursors aren't leaked. To make sure this doesn't happen we'll keep a map of

    [driver dataset-name] -> ReentrantReadWriteLock

  and make sure data can be loaded and synced for a given driver + dataset in a synchronized fashion. Code path looks
  like this:

  - Acquire read lock; attempt to fetch already-loaded data by calling [[tx/metabase-instance]].

    - If data already loaded: return existing `Database`. Release read lock. Done.

    - If data is not yet loaded, release read lock, acquire write lock. Check and see if data was loaded while we were
      waiting by calling [[tx/metabase-instance]] again.

      - If data was loaded by a different thread, return existing `Database`. Release write lock. Done.

      - If data has not been loaded, load data, create `Database`, and run sync. Return `Database`. Release write
        lock. Done.

        Any pending read and write locks will now be granted, and return the newly-loaded data.

  Because each driver and dataset has its own lock, various datasets can be loaded in parallel, but this will prevent
  the same dataset from being loaded multiple times."
  {:arglists '(^java.util.concurrent.locks.ReentrantReadWriteLock [driver dataset-name])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod dataset-lock :default
  [driver dataset-name]
  {:pre [(keyword? driver) (string? dataset-name)]}
  (let [key-path [driver dataset-name]]
    (or
     (get-in @dataset-locks key-path)
     (locking dataset-locks
       (or
        (get-in @dataset-locks key-path)
        ;; this is fair because the only time we'll try to get the write lock will be when the data is not yet loaded,
        ;; and we want to load the data as soon as possible rather have a bunch of read locks doing checks that we know
        ;; will fail
        (let [lock (ReentrantReadWriteLock. #_fair? true)]
          (swap! dataset-locks assoc-in key-path lock)
          lock))))))

(defn- get-existing-database-with-read-lock [driver {:keys [database-name], :as dbdef}]
  (let [lock (dataset-lock driver database-name)]
    (try
      (.. lock readLock lock)
      (tx/metabase-instance dbdef driver)
      (finally
        (.. lock readLock unlock)))))

(mu/defn- add-extra-metadata!
  "Add extra metadata like Field base-type, etc."
  [{:keys [table-definitions], :as _database-definition} :- [:map
                                                             [:table-definitions {:optional true} [:maybe [:sequential :map]]]]
   db                                                    :- :map]
  (doseq [{:keys [table-name], :as table-definition} table-definitions]
    (let [table (delay (or (tx/metabase-instance table-definition db)
                           (throw (Exception. (format "Table '%s' not loaded from definition:\n%s\nFound:\n%s"
                                                      table-name
                                                      (u/pprint-to-str (dissoc table-definition :rows))
                                                      (u/pprint-to-str (t2/select [:model/Table :schema :name], :db_id (:id db))))))))]
      (doseq [{:keys [field-name], :as field-definition} (:field-definitions table-definition)]
        (let [field (delay (or (tx/metabase-instance field-definition @table)
                               (throw (Exception. (format "Field '%s' not loaded from definition:\n%s"
                                                          field-name
                                                          (u/pprint-to-str field-definition))))))]
          (doseq [property [:visibility-type :semantic-type :effective-type :coercion-strategy]]
            (when-let [v (get field-definition property)]
              (log/debugf "SET %s %s.%s -> %s" property table-name field-name v)
              (t2/update! :model/Field (:id @field) {(keyword (str/replace (name property) #"-" "_")) (u/qualified-name v)}))))))))

(def ^:private create-database-timeout-ms
  "Max amount of time to wait for driver text extensions to create a DB and load test data."
  (u/minutes->ms 30)) ; Redshift is slow

(def ^:private sync-timeout-ms
  "Max amount of time to wait for sync to complete."
  (u/minutes->ms 15))

(defonce ^:private reference-sync-durations
  (delay (edn/read-string (slurp "test_resources/sync-durations.edn"))))

(defn- sync-newly-created-database! [driver {:keys [database-name], :as database-definition} connection-details db]
  (assert (= (humanization/humanization-strategy) :simple)
          "Humanization strategy is not set to the default value of :simple! Metadata will be broken!")
  (try
    (u/with-timeout sync-timeout-ms
      (let [reference-duration (or (some-> (get @reference-sync-durations database-name) u/format-nanoseconds)
                                   "NONE")
            full-sync?         (= database-name "test-data")]
        (u/profile (format "%s %s Database %s (reference H2 duration: %s)"
                           (if full-sync? "Sync" "QUICK sync") driver database-name reference-duration)
          ;; only do "quick sync" for non `test-data` datasets, because it can take literally MINUTES on CI.
          ;;
          ;; MEGA SUPER HACK !!! I'm experimenting with this so Redshift tests stop being so flaky on CI! It seems like
          ;; if we ever delete a table sometimes Redshift still thinks it's there for a bit and sync can fail because it
          ;; tries to sync a Table that is gone! So enable normal resilient sync behavior for Redshift tests to fix the
          ;; flakes. If this fixes things I'll try to come up with a more robust solution. -- Cam 2024-07-19. See #45874
          (binding [sync-util/*log-exceptions-and-continue?* (= driver :redshift)]
            (sync/sync-database! db {:scan (if full-sync? :full :schema)}))
          ;; add extra metadata for fields
          (try
            (add-extra-metadata! database-definition db)
            (catch Throwable e
              (log/error e "Error adding extra metadata"))))))
    (catch Throwable e
      (let [message (format "Failed to sync test database %s: %s" (pr-str database-name) (ex-message e))
            e       (ex-info message
                             {:driver             driver
                              :database-name      database-name
                              :connection-details connection-details}
                             e)]
        (log/error e message)
        (t2/delete! :model/Database :id (u/the-id db))
        (throw e)))))

(defn set-test-db-permissions!
  "Set data permissions for a newly created test database. We need to do this explicilty since new DB perms are
  set dynamically based on permissions for other existing DB, but we almost always want to start with full perms in tests."
  [new-db-id]
  (data-perms/set-database-permission! (perms-group/all-users) new-db-id :perms/view-data :unrestricted)
  (data-perms/set-database-permission! (perms-group/all-users) new-db-id :perms/create-queries :query-builder-and-native)
  (data-perms/set-database-permission! (perms-group/all-users) new-db-id :perms/download-results :one-million-rows))

(defn- extract-dbdef-info
  "Return dbdef info, map with table-name, field-name, fk-table-name keys, required for `fk-field-infos` construction
  in [[dbdef->fk-field-infos]]."
  [driver dbdef]
  (let [database-name (:database-name dbdef)
        ;; Following is required for presto. It names tables as `<db-name>_<table-name>` by use
        ;; of `qualified-name-components`.
        table-name-fn  (or (some-> (get-method @(requiring-resolve 'metabase.test.data.sql/qualified-name-components)
                                               driver)
                                   (partial driver database-name)
                                   (->> (comp last)))
                           identity)
        field-defs-with-table-name (fn [{:keys [table-name field-definitions] :as _table-definition}]
                                     (for [fd field-definitions]
                                       (assoc fd :table-name table-name)))
        field-def->info (fn [{:keys [table-name field-name fk] :as _field-definition}]
                          {:table-name (table-name-fn table-name)
                           :field-name field-name
                           :target-table-name (table-name-fn (name fk))})]
    (into []
          (comp (mapcat field-defs-with-table-name)
                (filter (comp some? :fk))
                (map field-def->info))
          (:table-definitions dbdef))))

(defn- dbdef->fk-field-infos
  "Generate `fk-field-infos` structure. It is a seq of maps of 2 keys: :id and :fk-target-field-id. Existing database,
  tables and fields in app db are examined to get the required info."
  [driver dbdef db]
  ;; dbdef-infos require only dbdef to be generated, while fk-field-infos get additional information querying app db.
  (when-some [dbdef-infos (not-empty (extract-dbdef-info driver dbdef))]
    (let [tables (t2/select :model/Table :db_id (:id db))
          fields (t2/select :model/Field {:where [:in :table_id (map :id tables)]})
          table-id->table (m/index-by :id tables)
          table-name->field-name->field (-> (group-by (comp :name table-id->table :table_id) fields)
                                            (update-vals (partial m/index-by :name)))
          table-name->pk-field (into {}
                                     (keep (fn [{:keys [name semantic_type table_id] :as field}]
                                             (when (or
                                                    ;; Following works on mongo.
                                                    (= semantic_type :type/PK)
                                                    ;; Heuristic for other dbs.
                                                    (= (u/lower-case-en name) "id"))
                                               [(get-in table-id->table [table_id :name]) field])))
                                     fields)]
      (map (fn [{:keys [table-name field-name target-table-name]}]
             {:id (get-in table-name->field-name->field [table-name field-name :id])
              :fk-target-field-id (get-in table-name->pk-field [target-table-name :id])})
           dbdef-infos))))

(defn- add-foreign-key-relationships!
  "Add foreign key relationships _to app db manually_. To be used with dbmses that do not support
  `:metadata/key-constraints`.

  `:metadata/key-constraints` driver feature signals that underlying dbms _is capable of reporting_ some columns
  as having foregin key relationship to other columns. If that's the case, sync infers those relationships.

  However, users can freely define those relationships also for dbmses that do not support that (eg. Mongo)
  in Metabase.

  This function simulates those user added fks, based on dataset definition. Therefore, it enables tests for eg.
  implicit joins to work."
  [driver dbdef db]
  (let [fk-field-infos (dbdef->fk-field-infos driver dbdef db)]
    (doseq [{:keys [id fk-target-field-id]} fk-field-infos]
      (t2/update! :model/Field :id id {:semantic_type :type/FK
                                       :fk_target_field_id fk-target-field-id}))))

(defn- load-dataset-data-if-needed!
  "Create the test dataset and load its data if needed. No-ops if this was already done successfully during this
  session.

  You can use this from the REPL like

    (load-dataset-data-if-needed!
     driver
     (tx/get-dataset-definition metabase.test.data.dataset-definitions/test-data))"
  [driver {:keys [database-name], :as dbdef}]
  (log/infof "Checking if test data for %s %s has already been loaded..." driver (pr-str database-name))
  ;; there's locking around this stuff elsewhere.
  (if (tx/dataset-already-loaded? driver dbdef)
    (log/infof "test dataset %s already loaded for driver %s; not reloading data."
               (pr-str database-name)
               driver)
    (do
      (log/info "Data has not been loaded yet. Loading...")
      (u/with-timeout create-database-timeout-ms
      ;; ALWAYS CREATE DATABASE AND LOAD DATA AS UTC! Unless you like broken tests.
        (test.tz/with-system-timezone-id! "UTC"
          (tx/create-db! driver dbdef))))))

(mu/defn- create-and-sync-Database!
  "Add DB object to Metabase DB. Return an instance of `:model/Database`."
  [driver                                           :- :keyword
   {:keys [database-name], :as database-definition} :- [:map [:database-name :string]]]
  (let [connection-details (tx/dbdef->connection-details driver :db database-definition)
        db                 (first (t2/insert-returning-instances! :model/Database
                                                                  (merge
                                                                   (toucan2.tools.with-temp/with-temp-defaults :model/Database)
                                                                   {:name     (tx/database-display-name-for-driver driver database-name)
                                                                    :engine   driver
                                                                    :details  connection-details
                                                                    :settings {:database-source-dataset-name database-name}})))]
    (sync-newly-created-database! driver database-definition connection-details db)
    (when (not (driver/database-supports? driver :metadata/key-constraints nil))
      (add-foreign-key-relationships! driver database-definition db))
    (set-test-db-permissions! (u/the-id db))
    ;; make sure we're returing an up-to-date copy of the DB
    (t2/select-one :model/Database :id (u/the-id db))))

(defn- create-database! [driver {:keys [database-name], :as database-definition}]
  {:pre [(seq database-name)]}
  (try
    (load-dataset-data-if-needed! driver database-definition)
    (create-and-sync-Database! driver database-definition)
    (catch Throwable e
      (log/errorf e "create-database! failed; destroying %s database %s" driver (pr-str database-name))
      (tx/destroy-db! driver database-definition)
      (throw e))))

(defn- create-database-with-bound-settings! [driver dbdef]
  (letfn [(thunk []
            (binding [api/*current-user-id*              nil
                      api/*current-user-permissions-set* nil]
              (create-database! driver dbdef)))]
    ;; make sure report timezone isn't set, possibly causing weird things to happen when data is loaded -- this
    ;; code may run inside of some other block that sets report timezone
    ;;
    ;; require/resolve used here to avoid circular refs
    (if (driver/report-timezone)
      ((requiring-resolve 'metabase.test.util/do-with-temporary-setting-value!)
       :report-timezone nil
       thunk)
      (thunk))))

(defn- create-and-sync-database-with-write-lock! [driver {:keys [database-name], :as dbdef}]
  (let [lock (dataset-lock driver database-name)]
    (try
      (.. lock writeLock lock)
      (or
       (tx/metabase-instance dbdef driver)
       (create-database-with-bound-settings! driver dbdef))
      (finally
        (.. lock writeLock unlock)))))

(defn- reload-data-if-needed!
  "If a test dataset was loaded before [[session-init-time]], get the write lock and
  call [[load-dataset-data-if-needed!]] to make sure the test data is loaded; update the `created_at` timestamp so we
  don't need to check again next time around."
  [driver {:keys [database-name], :as dbdef} existing-database]
  (log/debugf "Test data %s %s was loaded at %s; session started at %s"
              driver (pr-str database-name) (:created_at existing-database) session-init-time)
  (when (t/before? (:created_at existing-database) session-init-time)
    (log/infof "Test data for %s %s was loaded by previous session, checking to see if data needs to be reloaded..."
               driver
               (pr-str database-name))
    (let [lock (dataset-lock driver database-name)]
      (try
        (.. lock writeLock lock)
        ;; once we acquire the write lock, check that the value of `created_at` hasn't been updated by another thread
        ;; before reloading the data.
        (when-let [created-at (t2/select-one-fn :created_at :model/Database :id (u/the-id existing-database))]
          (when (t/before? created-at session-init-time)
            (log/infof "Reloading test data for %s %s if needed..." driver (pr-str database-name))
            ;; load the data again if needed.
            (load-dataset-data-if-needed! driver dbdef)
            ;; update the `created_at` timestamp for the test data so the next call to `get-or-create-database!` doesn't
            ;; need to go thru this again.
            (t2/update! :model/Database (u/the-id existing-database) {:created_at (t/offset-date-time)})))
        (finally
          (.. lock writeLock unlock))))))

(defn default-get-or-create-database!
  "Default implementation of [[metabase.test.data.impl/get-or-create-database!]]."
  [driver dbdef]
  (initialize/initialize-if-needed! :plugins :db)
  (let [dbdef (tx/get-dataset-definition dbdef)]
    (or
     (when-let [existing-database (get-existing-database-with-read-lock driver dbdef)]
       (reload-data-if-needed! driver dbdef existing-database)
       existing-database)
     (create-and-sync-database-with-write-lock! driver dbdef))))
