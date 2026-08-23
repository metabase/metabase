(ns metabase.test.data.bigquery-cloud-sdk
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms.test-util :as transforms.test-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetListOption
    BigQuery$DatasetOption
    BigQuery$TableListOption
    BigQuery$TableOption
    BigQueryException
    Dataset
    DatasetId
    DatasetInfo
    DatasetInfo$Builder
    Field
    Field$Mode
    InsertAllRequest
    InsertAllRequest$RowToInsert
    InsertAllResponse
    LegacySQLTypeName
    Schema
    StandardTableDefinition
    TableId
    TableInfo)
   (java.time Duration LocalDate)))

(set! *warn-on-reflection* true)

(sql.tx/add-test-extensions! :bigquery-cloud-sdk)

;;; ----------------------------------------------- Connection Details -----------------------------------------------

(defn normalize-name
  "Returns a normalized name for a test database or table"
  [identifier]
  (str/replace (name identifier) "-" "_"))

(mr/def ::dataset-id
  [:and
   [:string {:min 1, :max 1024}]
   [:re
    {:error/message "Dataset IDs must be alphanumeric (plus underscores)"}
    #"^[\w_]+$"]])

(def dataset-id-prefix
  "Namespace owned by the labelled-dataset scheme in [[metabase.test.data.bigquery-cloud-sdk.dataset-state]].

  The generation digit is what lets this branch share a project with branches still running the previous scheme:
  those datasets are named `sha_...` and are neither read nor deleted here, and ours are invisible to them. Bump the
  digit again if the lifecycle rules ever change in a way that makes existing datasets unusable, rather than
  migrating or deleting them in place - deleting a dataset another branch's CI is reading is the failure this whole
  change exists to prevent."
  "mbds1_")

(def ^:private measuring-build-time-segment
  "TEMPORARY: build-timing experiment. REVERT BEFORE SHIPPING - remove this var and its three use sites.

  Scopes dataset names to one CI run, so every push builds its gold datasets from scratch and
  `[bq-dataset-build]` reports a cold build time each time instead of only on the first push.

  Deliberately not implemented by deleting the existing datasets: a delete would race the other partition of the
  same run, and any concurrent branch, which is the failure this whole change exists to prevent. Giving each run its
  own names gets a cold build with nothing destructive. Both partitions of a run share the segment, so they still
  exercise the build/wait race rather than each building a private copy.

  Empty outside GitHub Actions, so local runs keep reusing their datasets. `GITHUB_RUN_ATTEMPT` is included so that
  re-running a workflow measures a cold build too."
  (if-let [run-id (System/getenv "GITHUB_RUN_ID")]
    (format "run%s_%s_" run-id (or (System/getenv "GITHUB_RUN_ATTEMPT") "1"))
    ""))

(defn- measuring-build-time?
  "TEMPORARY: build-timing experiment. REVERT BEFORE SHIPPING."
  []
  (seq measuring-build-time-segment))

(mu/defn test-dataset-id :- ::dataset-id
  "Prepend `database-name` with the hash of the db-def so we don't stomp on any other jobs running at the same
  time."
  [{:keys [database-name] :as db-def}]
  (cond (str/starts-with? database-name dataset-id-prefix)
        database-name
        ;; releases get their own isolated datasets
        (tx/on-master-or-release-branch?)
        (str dataset-id-prefix measuring-build-time-segment "rel_" (tx/hash-dataset db-def) "_" (normalize-name database-name))
        :else
        (str dataset-id-prefix measuring-build-time-segment "pr_" (tx/hash-dataset db-def) "_" (normalize-name database-name))))

(defn- test-db-details []
  (if tx/*use-routing-details*
    {:service-account-json (tx/db-test-env-var :bigquery-cloud-sdk :service-account-json-routing)}
    {:project-id           (tx/db-test-env-var :bigquery-cloud-sdk :project-id)
     :service-account-json (tx/db-test-env-var :bigquery-cloud-sdk :service-account-json)}))

(defn- bigquery
  "Get an instance of a `Bigquery` client."
  ^BigQuery []
  (#'bigquery/database-details->client (test-db-details)))

(defn execute-respond [_ rows]
  (into [] rows))

(defn project-id
  "BigQuery project ID that we're using for tests, either from the env var `MB_BIGQUERY_TEST_PROJECT_ID`, or if that is
  not set, from the BigQuery client instance itself (which ultimately comes from the value embedded in the service
  account JSON)."
  ^String []
  (let [details (test-db-details)
        bq      (bigquery)]
    (or (:project-id details) (.. bq getOptions getProjectId))))

(defmethod tx/dbdef->connection-details :bigquery-cloud-sdk
  [_driver _context db-def]
  (assoc (test-db-details)
         :dataset-filters-type "inclusion"
         :dataset-filters-patterns (test-dataset-id db-def)
         :include-user-id-and-hash true))

(defmethod driver/database-supports? [:bigquery-cloud-sdk :test/dynamic-dataset-loading]
  [_driver _feature _database] false)

;;; -------------------------------------------------- Loading Data --------------------------------------------------

(mu/defmethod sql.tx/qualified-name-components :bigquery-cloud-sdk
  ([driver db-name]
   (if (some-> db-name (str/starts-with? dataset-id-prefix))
     [db-name]
     [(test-dataset-id (tx/get-dataset-definition (or data.impl/*dbdef-used-to-create-db* (tx/default-dataset driver))))]))
  ([driver
    db-name    :- :string
    table-name :- :string]
   (into (sql.tx/qualified-name-components driver db-name) [table-name]))
  ([driver
    db-name    :- :string
    table-name :- :string
    field-name :- :string]
   (into (sql.tx/qualified-name-components driver db-name table-name) [field-name])))

(defmethod ddl.i/format-name :bigquery-cloud-sdk
  [_driver table-or-field-name]
  (str/replace table-or-field-name #"-" "_"))

(def ^:private work-dataset-lifetime-ms
  "[[dataset-state/retention]]'s work lifetime as the bare millis `setDefaultTableLifetime` takes."
  (.toMillis ^Duration (:work-retention dataset-state/retention)))

(mu/defn- create-dataset!
  "Create `dataset-id` carrying `labels`, which [[dataset-state]] reads back to decide whether it is usable.

  A dataset labelled ephemeral also gets a default table lifetime, so a process killed before its `finally` runs
  leaves nothing behind that costs storage. BigQuery has no dataset-level expiry, so the empty dataset does survive
  and is left to [[delete-old-datasets!]]."
  [^String dataset-id :- ::dataset-id labels]
  (let [^DatasetInfo$Builder builder (DatasetInfo/newBuilder (DatasetId/of (project-id) dataset-id))]
    (.setLabels builder labels)
    (when (dataset-state/ephemeral? labels)
      (.setDefaultTableLifetime builder (long work-dataset-lifetime-ms)))
    (.create (bigquery) (.build builder) (u/varargs BigQuery$DatasetOption)))
  (log/info (u/format-color 'blue "Created BigQuery dataset `%s.%s` %s." (project-id) dataset-id (pr-str labels))))

(defn- dataset-labels
  "Labels on `dataset-id`, or `nil` if there is no such dataset. `nil` and `{}` mean different things to
  [[tx/create-db!]]: absent versus present-but-unpublished."
  [^String dataset-id]
  (when-let [^Dataset dataset (.getDataset (bigquery) dataset-id (u/varargs BigQuery$DatasetOption))]
    (into {} (.getLabels dataset))))

(defn- set-dataset-labels!
  "Replace the labels on `dataset-id`. Callers pass a complete set, so this is correct whether BigQuery merges or
  replaces the map."
  [^String dataset-id labels]
  (let [^DatasetInfo$Builder builder (DatasetInfo/newBuilder (DatasetId/of (project-id) dataset-id))]
    (.setLabels builder labels)
    (.update (bigquery) (.build builder) (u/varargs BigQuery$DatasetOption))))

(defn execute!
  "Execute arbitrary (presumably DDL) SQL statements against the test project. Waits for statement to complete, throwing
  an Exception if it fails."
  [format-string & args]
  (driver/with-driver :bigquery-cloud-sdk
    (let [sql (apply format format-string args)]
      (log/infof "[BigQuery] %s\n" sql)
      (flush)
      (#'bigquery/execute-bigquery execute-respond (test-db-details) sql [] nil))))

(defn execute-params!
  "Execute arbitrary (presumably DDL) SQL statements against the test project. Waits for statement to complete, throwing
  an Exception if it fails."
  [sql params]
  (driver/with-driver :bigquery-cloud-sdk
    (log/infof "[BigQuery] %s\n" sql)
    (flush)
    (#'bigquery/execute-bigquery execute-respond (test-db-details) sql params nil)))

(defn- delete-dataset!
  "Delete `dataset-id` and everything in it, with no regard for what it holds.

  Separate from [[destroy-dataset!]] because the guard there protects the shared `test-data` dataset from tests, and
  two callers legitimately need to delete it anyway: a build that failed partway through, and the reaper."
  [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (.delete (bigquery) dataset-id (u/varargs
                                  BigQuery$DatasetDeleteOption
                                  [(BigQuery$DatasetDeleteOption/deleteContents)]))
  (log/infof "Deleted BigQuery dataset `%s.%s`." (project-id) dataset-id))

(defn- destroy-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  ;; the printlns below are on purpose because we want them to show up when running tests, even on CI, to make sure this
  ;; stuff is working correctly. We can change it to `log` in the future when we're satisfied everything is working as
  ;; intended -- Case
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Deleting dataset: " dataset-id)
  (when (= dataset-id (test-dataset-id (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))
    (throw (Exception. "tried to delete test-data")))
  (delete-dataset! dataset-id))

(defn base-type->bigquery-type [base-type]
  (let [types {:type/BigInteger     :INTEGER
               :type/Boolean        :BOOLEAN
               :type/Date           :DATE
               :type/DateTime       :DATETIME
               :type/DateTimeWithTZ :TIMESTAMP
               :type/Decimal        :BIGNUMERIC
               :type/Dictionary     :RECORD
               :type/Float          :FLOAT
               :type/Integer        :INTEGER
               :type/Text           :STRING
               :type/Time           :TIME}]
    (or (get types base-type)
        (some base-type->bigquery-type (parents base-type)))))

;; Fields must contain only letters, numbers, spaces, and underscores, start with a letter or underscore, and be at most 128
;; characters long.
(def ^:private ValidFieldName
  [:re #"^[A-Za-z_](\w| ){0,127}$"])

(mu/defn- valid-field-name :- ValidFieldName
  ^String [field-name]
  field-name)

(defn- field-definitions->Fields [field-definitions]
  (into
   []
   (map (fn [{:keys [field-name base-type nested-fields collection-type]}]
          (let [field-type (or (some-> collection-type base-type->bigquery-type)
                               (base-type->bigquery-type base-type)
                               (let [message (format "Don't know what BigQuery type to use for base type: %s" base-type)]
                                 (log/error (u/format-color 'red message))
                                 (throw (ex-info message {:metabase.util/no-auto-retry? true}))))
                builder (Field/newBuilder
                         (valid-field-name field-name)
                         (LegacySQLTypeName/valueOf (name field-type))
                         ^"[Lcom.google.cloud.bigquery.Field;" (into-array Field (field-definitions->Fields nested-fields)))]
            (cond-> builder
              (isa? :type/Collection base-type) (.setMode Field$Mode/REPEATED)
              :always (.build)))))
   field-definitions))

(defn- create-table*!
  [dataset-id table-id field-definitions]
  (let [tbl-id (TableId/of dataset-id table-id)
        schema (Schema/of (u/varargs Field (field-definitions->Fields (cons {:field-name "id"
                                                                             :base-type :type/Integer}
                                                                            field-definitions))))
        tbl    (TableInfo/of tbl-id (StandardTableDefinition/of schema))]
    (.create (bigquery) tbl (u/varargs BigQuery$TableOption))))

(mu/defn- create-table!
  [^String dataset-id :- ::lib.schema.common/non-blank-string
   ^String table-id :- ::lib.schema.common/non-blank-string
   field-definitions]
  (create-table*! dataset-id table-id field-definitions)
  ;; now verify that the Table was created
  (.listTables (bigquery) dataset-id (u/varargs BigQuery$TableListOption))
  (log/info (u/format-color 'blue "Created BigQuery table `%s.%s.%s`." (project-id) dataset-id table-id)))

(defn- table-row-count ^Integer [^String dataset-id, ^String table-id]
  (let [sql (format "SELECT count(*) FROM `%s.%s.%s`" (project-id) dataset-id table-id)]
    (ffirst (#'bigquery/execute-bigquery execute-respond (test-db-details) sql [] nil))))

(defprotocol ^:private Insertable
  (^:private ->insertable [this]
    "Convert a value to an appropriate Google type when inserting a new row."))

(extend-protocol Insertable
  nil
  (->insertable [_] nil)

  Object
  (->insertable [this] this)

  clojure.lang.Keyword
  (->insertable [k]
    (u/qualified-name k))

  java.time.temporal.Temporal
  (->insertable [t]
    ;; BigQuery will barf if you try to specify greater than microsecond precision.
    (u.date/format-sql (t/truncate-to t :micros)))

  java.time.LocalDate
  (->insertable [t]
    (u.date/format-sql t))

  ;; normalize to UTC. BigQuery normalizes it anyway and tends to complain when inserting values that have an offset
  java.time.OffsetDateTime
  (->insertable [t]
    (->insertable (t/local-date-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; for whatever reason the `date time zone-id` syntax that works in SQL doesn't work when loading data
  java.time.ZonedDateTime
  (->insertable [t]
    (->insertable (t/offset-date-time t)))

  ;; normalize to UTC, since BigQuery doesn't support TIME WITH TIME ZONE
  java.time.OffsetTime
  (->insertable [t]
    (->insertable (t/local-time (t/with-offset-same-instant t (t/zone-offset 0))))))

(defn- ->json [row-map]
  (into {} (for [[k v] row-map]
             [(name k) (->insertable v)])))

(defn- rows->request ^InsertAllRequest [^String dataset-id ^String table-id row-maps]
  (let [insert-rows (map (fn [r]
                           (InsertAllRequest$RowToInsert/of (str (get r :id)) (->json r))) row-maps)]
    (InsertAllRequest/of (TableId/of dataset-id table-id) (u/varargs InsertAllRequest$RowToInsert insert-rows))))

(def ^:private max-rows-per-request
  "Max number of rows BigQuery lets us insert at once."
  10000)

(defn- insert-data! [^String dataset-id ^String table-id row-maps]
  {:pre [(seq dataset-id) (seq table-id) (sequential? row-maps) (seq row-maps) (every? map? row-maps)]}
  (doseq [chunk (partition-all max-rows-per-request row-maps)
          :let  [_                           (log/infof "Inserting %d rows like\n%s"
                                                        (count chunk)
                                                        (u/pprint-to-str (first chunk)))
                 req                         (rows->request dataset-id table-id chunk)
                 ^InsertAllResponse response (.insertAll (bigquery) req)]]
    (log/info  (u/format-color 'blue "Sent request to insert %d rows into `%s.%s.%s`"
                               (count (.getRows req))
                               (project-id) dataset-id table-id))
    (when (seq (.getInsertErrors response))
      (log/errorf "Error inserting rows: %s" (u/pprint-to-str (seq (.getInsertErrors response))))
      (throw (ex-info "Error inserting rows"
                      {:errors                       (seq (.getInsertErrors response))
                       :metabase.util/no-auto-retry? true
                       :rows                         row-maps
                       :data                         (.getRows req)}))))
  ;; Wait up to 120 seconds for all the rows to be loaded and become available by BigQuery
  (let [max-wait-seconds   120
        expected-row-count (count row-maps)]
    (log/infof "Waiting for %d rows to be loaded..." expected-row-count)
    (loop [seconds-to-wait-for-load max-wait-seconds]
      (let [actual-row-count (table-row-count dataset-id table-id)]
        (cond
          (= expected-row-count actual-row-count)
          (do
            (log/infof "Loaded %d rows in %d seconds." expected-row-count (- max-wait-seconds seconds-to-wait-for-load))
            :ok)

          (> seconds-to-wait-for-load 0)
          (do (Thread/sleep 1000)
              (log/info ".")
              (recur (dec seconds-to-wait-for-load)))

          :else
          (let [error-message (format "Failed to load table data for `%s.%s.%s`: expected %d rows, loaded %d"
                                      (project-id) dataset-id table-id expected-row-count actual-row-count)]
            (log/error (u/format-color 'red error-message))
            (throw (ex-info error-message {:metabase.util/no-auto-retry? true}))))))))

(defn- tabledef->prepared-rows
  "Convert `table-definition` to a format appropriate for passing to `insert-data!`."
  [{:keys [field-definitions rows]}]
  {:pre [(every? map? field-definitions) (sequential? rows) (seq rows)]}
  (let [field-names (map :field-name field-definitions)]
    (for [[i row] (m/indexed rows)]
      (assoc (zipmap field-names row)
             :id (inc i)))))

(defn- load-tabledef! [dataset-id {:keys [table-name field-definitions], :as tabledef}]
  (let [table-name (normalize-name table-name)]
    (create-table! dataset-id table-name field-definitions)
    (when (seq (:rows tabledef))
      ;; retry the `insert-data!` step up to 5 times because it seems to fail silently a lot. Since each row is given a
      ;; unique key it shouldn't result in duplicates.
      (loop [num-retries 5]
        (let [^Throwable e (try
                             (insert-data! dataset-id table-name (tabledef->prepared-rows tabledef))
                             nil
                             (catch Throwable e
                               e))]
          (when e
            (if (pos? num-retries)
              (recur (dec num-retries))
              (throw e))))))))

(defn datasets-with-labels
  "Every dataset in the test project, as `{:dataset-id .. :labels ..}`.

  One `datasets.list` and no query jobs, which is what keeps the reaper off the DML path that the tracking table
  used to sit on."
  []
  (for [^Dataset dataset (.iterateAll (.listDatasets (bigquery) (project-id) (u/varargs BigQuery$DatasetListOption)))]
    {:dataset-id (.getDataset (.getDatasetId dataset))
     :labels     (into {} (.getLabels dataset))}))

(defn delete-old-datasets!
  "Delete every test dataset the retention policy has given up on: work datasets whose test is long gone, gold
  datasets nothing has used in a fortnight, and datasets abandoned part-way through a build.

  Meant to run out of band on a schedule rather than from a test. It reads dataset labels only, so it costs one
  `datasets.list` and no query jobs, and it is safe to run while tests are going: a dataset in use is touched
  by [[tx/track-dataset]] well inside its retention window."
  []
  (let [today (LocalDate/now)]
    (doseq [{:keys [dataset-id labels]} (datasets-with-labels)
            :when (dataset-state/reapable? labels today)]
      (log/info (u/format-color 'blue "Reaping BigQuery dataset %s %s" dataset-id (pr-str labels)))
      (u/ignore-exceptions (delete-dataset! dataset-id)))))

(defn database-exists?!
  [db-def]
  (->>
   (execute-params!
    (format "select true from `%s`.INFORMATION_SCHEMA.SCHEMATA where schema_name = ?"
            (project-id))
    [(test-dataset-id db-def)])
   ffirst))

(defmethod tx/dataset-already-loaded? :bigquery-cloud-sdk
  [_driver db-def]
  (dataset-state/ready? (dataset-labels (test-dataset-id db-def))))

(defmethod tx/track-dataset :bigquery-cloud-sdk
  [_driver db-def]
  (let [dataset-id (test-dataset-id db-def)
        today      (LocalDate/now)
        labels     (dataset-labels dataset-id)
        jitter     (dataset-state/random-touch-jitter)]
    (when (and (seq labels) (dataset-state/needs-touch? labels today jitter))
      ;; Best-effort. A lost race or a rejected write only means another test records the use a bit later, whereas
      ;; failing the test over it would turn retention bookkeeping into a source of flakes.
      (u/ignore-exceptions
       (set-dataset-labels! dataset-id (dataset-state/touched-labels labels today))))))

(def ^:private publish-timeout-ms
  "How long to wait for another process to finish loading a dataset. Generous because loading `test-data` into a cold
  project takes minutes."
  (u/minutes->ms 20))

(defn- wait-for-publish!
  "Block until `dataset-id` is published by whoever is building it.

  Returns `:ready`, or `:discarded` if the dataset disappears - that build failed and cleaned up after itself, so the
  caller should build it rather than wait out the timeout on work nobody is doing."
  [^String dataset-id]
  (log/infof "Waiting for another process to finish loading BigQuery dataset %s" dataset-id)
  (let [deadline (+ (System/currentTimeMillis) publish-timeout-ms)]
    (loop []
      (let [labels (dataset-labels dataset-id)]
        (cond
          (nil? labels)                 :discarded
          (dataset-state/ready? labels) :ready

          (> (System/currentTimeMillis) deadline)
          (throw (ex-info "Timed out waiting for a BigQuery test dataset to be published"
                          {:dataset-id dataset-id, :timeout-ms publish-timeout-ms}))

          :else
          (do (Thread/sleep 2000) (recur)))))))

(defn- load-dataset!
  [driver ^String dataset-id {:keys [table-definitions options]}]
  (doseq [tabledef table-definitions]
    (load-tabledef! dataset-id tabledef))
  (doseq [native-ddl (:native-ddl options)]
    (apply execute! (sql.tx/compile-native-ddl driver native-ddl))))

(defn- build-dataset!
  "Create, load and publish `dataset-id`.

  A failed load discards the whole dataset instead of leaving it to be finished later: nothing here can tell a table
  whose rows all landed from one whose insert died half way, so resuming would quietly yield a dataset short some
  rows. Publishing is the single label write at the end, and that write is the only thing that makes the dataset
  visible to [[tx/dataset-already-loaded?]] - until it lands, a concurrent process waits rather than reading tables
  that exist but are still filling."
  [driver ^String dataset-id db-def ephemeral? ^LocalDate today attempts]
  (let [created? (try
                   (create-dataset! dataset-id (dataset-state/building-labels {:ephemeral? ephemeral?, :today today}))
                   true
                   (catch BigQueryException e
                     (if (= 409 (.getCode e))
                       false
                       (throw e))))]
    (cond
      created?
      (try
        (let [start (System/nanoTime)]
          (load-dataset! driver dataset-id db-def)
          (set-dataset-labels! dataset-id (dataset-state/ready-labels {:ephemeral? ephemeral?, :today today}))
          ;; `println` rather than `log/info`, for the same reason as the one in [[destroy-dataset!]]: the console
          ;; appender in `test_config/log4j2-test.xml` filters at FATAL, and the appender that does accept INFO
          ;; writes `logs/test-log.json`, which `drivers.yml` never uploads. A logged line would be unreadable on CI,
          ;; and how long a rebuild costs is the number that decides how hard retention should work to avoid one.
          #_{:clj-kondo/ignore [:discouraged-var]}
          (println (u/format-color 'green "[bq-dataset-build] %s %s built in %s (%d tables, %d rows)"
                                   ;; the tier the definition asks for, not the `ephemeral?` flag, which the
                                   ;; build-timing experiment also forces on for run-scoped gold datasets
                                   (if (tx/ephemeral? db-def) "work" "gold")
                                   dataset-id
                                   (u/format-nanoseconds (- (System/nanoTime) start))
                                   (count (:table-definitions db-def))
                                   (reduce + 0 (map (comp count :rows) (:table-definitions db-def))))))
        (catch Throwable e
          (log/warnf e "Failed to load BigQuery dataset %s; discarding it so the next attempt starts clean" dataset-id)
          (u/ignore-exceptions (delete-dataset! dataset-id))
          (throw e)))

      ;; lost the race to create it, so the winner is loading it and will publish
      (= :ready (wait-for-publish! dataset-id))
      nil

      (pos? attempts)
      (build-dataset! driver dataset-id db-def ephemeral? today (dec attempts))

      :else
      (throw (ex-info "BigQuery test dataset was discarded by every process that tried to build it"
                      {:dataset-id dataset-id})))))

(defmethod tx/create-db! :bigquery-cloud-sdk
  [driver {:keys [database-name table-definitions] :as db-def} & _]
  {:pre [(seq database-name) (sequential? table-definitions)]}
  (let [dataset-id (test-dataset-id db-def)
        ;; TEMPORARY: build-timing experiment. REVERT BEFORE SHIPPING - drop the `or` and keep `tx/ephemeral?`.
        ;; A run-scoped dataset is used by exactly one CI run and never looked up again, so it is ephemeral in
        ;; substance whatever the dbdef says. Labelling it so gives it the one-day table lifetime, which is what
        ;; keeps this experiment from leaving a fresh set of permanent datasets behind on every push.
        ephemeral? (or (tx/ephemeral? db-def) (boolean (measuring-build-time?)))
        today      (LocalDate/now)
        labels     (dataset-labels dataset-id)]
    (cond
      (dataset-state/ready? labels)
      (log/infof "BigQuery dataset %s is already published; not reloading." dataset-id)

      (dataset-state/building? labels)
      (when (= :discarded (wait-for-publish! dataset-id))
        (build-dataset! driver dataset-id db-def ephemeral? today 1))

      ;; It exists but says nothing about itself: either it predates this scheme or its publish never landed. Its
      ;; tables cannot be trusted either way, and the cost of being wrong is a silently short dataset, so start over.
      (some? labels)
      (do (delete-dataset! dataset-id)
          (build-dataset! driver dataset-id db-def ephemeral? today 1))

      :else
      (build-dataset! driver dataset-id db-def ephemeral? today 1))))

(defmethod tx/destroy-db! :bigquery-cloud-sdk
  [_ db-def]
  (destroy-dataset! (test-dataset-id db-def)))

(defmethod tx/aggregate-column-info :bigquery-cloud-sdk
  ([driver aggregation-type]
   (merge
    ((get-method tx/aggregate-column-info :sql-jdbc/test-extensions) driver aggregation-type)
    (when (#{:count :cum-count} aggregation-type)
      {:base_type :type/Integer})))

  ([driver aggregation-type field]
   (merge
    ((get-method tx/aggregate-column-info :sql-jdbc/test-extensions) driver aggregation-type field)
    ;; BigQuery averages, standard deviations come back as Floats. This might apply to some other ag types as well;
    ;; add them as we come across them.
    (when (#{:avg :stddev} aggregation-type)
      {:base_type :type/Float})
    (when (#{:count :cum-count} aggregation-type)
      {:base_type :type/Integer}))))

(defmethod tx/create-view-of-table! :bigquery-cloud-sdk
  [driver database view-name table-name options]
  (apply execute! (sql.tx/create-view-of-table-sql driver database view-name table-name options)))

(defmethod tx/drop-view! :bigquery-cloud-sdk
  [driver database view-name options]
  (apply execute! (sql.tx/drop-view-sql driver database view-name options)))

(defmethod transforms.test-util/delete-schema! :bigquery-cloud-sdk [_driver _db schema]
  (destroy-dataset! schema))

(comment
  "REPL utilities for static datasets"
  (destroy-dataset! (test-dataset-id (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))
  (tx/track-dataset :bigquery-cloud-sdk (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data)))
  (dataset-labels (test-dataset-id (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))
  (delete-old-datasets!)
  (database-exists?! (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))

(defn ^:private get-test-data-name
  []
  (test-dataset-id
   (tx/get-dataset-definition (or data.impl/*dbdef-used-to-create-db*
                                  (tx/default-dataset :bigquery-cloud-sdk)))))

(defmethod sql.tx/session-schema :bigquery-cloud-sdk [_driver] (get-test-data-name))
