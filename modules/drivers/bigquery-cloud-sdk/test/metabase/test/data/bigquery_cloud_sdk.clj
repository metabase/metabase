(ns metabase.test.data.bigquery-cloud-sdk
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.transforms.test-util :as transforms.test-util]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetOption
    BigQuery$TableListOption
    BigQuery$TableOption
    BigQueryException
    DatasetId
    DatasetInfo
    Field
    Field$Mode
    InsertAllRequest
    InsertAllRequest$RowToInsert
    InsertAllResponse
    LegacySQLTypeName
    Schema
    StandardTableDefinition
    TableId
    TableInfo)))

(set! *warn-on-reflection* true)

;; Dummy comment to trigger BigQuery CI tests
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

(mu/defn test-dataset-id :- ::dataset-id
  "Prepend `database-name` with the hash of the db-def so we don't stomp on any other jobs running at the same
  time."
  [{:keys [database-name] :as db-def}]
  (if (str/starts-with? database-name "sha_")
    database-name
    (str "sha_" (tx/hash-dataset db-def) "_" (normalize-name database-name))))

(defn- test-db-details []
  {:project-id (tx/db-test-env-var :bigquery-cloud-sdk :project-id)
   :service-account-json (tx/db-test-env-var :bigquery-cloud-sdk :service-account-json)})

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

;;; -------------------------------------------------- Loading Data --------------------------------------------------

(mu/defmethod sql.tx/qualified-name-components :bigquery-cloud-sdk
  ([driver db-name]
   (if (some-> db-name (str/starts-with? "sha_"))
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

(mu/defn- create-dataset! [^String dataset-id :- ::dataset-id]
  (.create (bigquery) (DatasetInfo/of (DatasetId/of (project-id) dataset-id)) (u/varargs BigQuery$DatasetOption))
  (log/info (u/format-color 'blue "Created BigQuery dataset `%s.%s`." (project-id) dataset-id)))

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

(defn- destroy-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  ;; the printlns below are on purpose because we want them to show up when running tests, even on CI, to make sure this
  ;; stuff is working correctly. We can change it to `log` in the future when we're satisfied everything is working as
  ;; intended -- Case
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Deleting dataset: " dataset-id)
  (when (= dataset-id (test-dataset-id (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))
    (.printStackTrace (Exception. "This should not happen")))
  (.delete (bigquery) dataset-id (u/varargs
                                   BigQuery$DatasetDeleteOption
                                   [(BigQuery$DatasetDeleteOption/deleteContents)]))
  (execute-params!
   (format "DELETE FROM `%s.metabase_test_tracking.datasets` WHERE `name` = ?"
           (project-id))
   [dataset-id])
  (log/infof "Deleted BigQuery dataset `%s.%s`." (project-id) dataset-id))

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

(defn delete-old-datasets!
  []
  (let [all-outdated (execute!
                      (str "(SELECT `name` FROM `%s.metabase_test_tracking.datasets` WHERE `accessed_at` < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL -2 hour))"
                           " UNION ALL "
                           "(select schema_name from `%s`.INFORMATION_SCHEMA.SCHEMATA d
                             where d.schema_name not in (select name from `%s.metabase_test_tracking.datasets`)
                             and d.schema_name like 'sha_%%'
                             and creation_time < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL -2 hour))")
                      (project-id)
                      (project-id)
                      (project-id))]
    (doseq [outdated (map first all-outdated)]
      (log/info (u/format-color 'blue "Deleting temporary dataset more than two days old: %s`." outdated))
      (destroy-dataset! outdated))))

(defonce ^:private deleted-old-datasets?
  (atom false))

(defn- delete-old-datasets-if-needed!
  "Call [[delete-old-datasets!]], only if we haven't done so already."
  []
  (when (compare-and-set! deleted-old-datasets? false true)
    (delete-old-datasets!)))

(defn- setup-tracking-dataset!
  "Idempotently create test tracking database"
  []
  (let [dataset-id "metabase_test_tracking"]
    (try
      (create-dataset! dataset-id)
      (catch BigQueryException e
        ;; Already exists, ignore
        (when-not (= (.getCode e) 409)
          (throw e))))
    (try
      (create-table*! dataset-id "datasets" [{:field-name "hash"
                                              :base-type  :type/Text}
                                             {:field-name "name"
                                              :base-type  :type/Text}
                                             {:field-name "accessed_at"
                                              :base-type  :type/DateTimeWithTZ}
                                             {:field-name "access_note"
                                              :base-type  :type/Text}])
      (catch BigQueryException e
       ;; Already exists, ignore
        (when-not (= (.getCode e) 409)
          (throw e))))))

(defn- dataset-tracked?!
  [db-def]
  (->
   (execute-params!
    (format "SELECT true FROM `%s.metabase_test_tracking.datasets` WHERE `hash` = ? and `name` = ?"
            (project-id))
    [(tx/hash-dataset db-def)
     (test-dataset-id db-def)])
   ffirst))

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
  (setup-tracking-dataset!)
  (and
   (dataset-tracked?! db-def)
   (database-exists?! db-def)))

(defmethod tx/track-dataset :bigquery-cloud-sdk
  [_driver db-def]
  ; ignore exceptions because of https://cloud.google.com/bigquery/docs/troubleshoot-queries#could_not_serialize
  (u/ignore-exceptions
    (execute-params!
     (format (str "MERGE INTO `%s.metabase_test_tracking.datasets` d"
                  "  USING (select ? as `hash`, ? as `name`, current_timestamp() as accessed_at, ? as access_note) as n on d.`hash` = n.`hash`"
                  "  WHEN MATCHED THEN UPDATE SET d.accessed_at = n.accessed_at, d.access_note = n.access_note"
                  "  WHEN NOT MATCHED THEN INSERT (`hash`,`name`, accessed_at, access_note) VALUES (n.`hash`, n.`name`, n.accessed_at, n.access_note)") (project-id))
     [(tx/hash-dataset db-def)
      (test-dataset-id db-def)
      (tx/tracking-access-note)])))

(defmethod tx/create-db! :bigquery-cloud-sdk
  [driver {:keys [database-name table-definitions options] :as db-def} & _]
  {:pre [(seq database-name) (sequential? table-definitions)]}
  (delete-old-datasets-if-needed!)
  (let [dataset-id (test-dataset-id db-def)]
    (if (database-exists?! db-def)
      (log/info (u/format-color 'blue "Dataset already exists %s, not loading db" (pr-str dataset-id)))
      (try
        (log/infof "Creating dataset %s..." (pr-str dataset-id))
        (create-dataset! dataset-id)
        ;; now create tables and load data.
        (doseq [tabledef table-definitions]
          (load-tabledef! dataset-id tabledef))
        (doseq [native-ddl (:native-ddl options)]
          (apply execute! (sql.tx/compile-native-ddl driver native-ddl)))
        (log/info (u/format-color 'green "Successfully created %s." (pr-str dataset-id)))
        (catch Throwable e
          (log/error (u/format-color 'red  "Failed to load BigQuery dataset %s." (pr-str dataset-id)))
          (log/error (u/pprint-to-str 'red (Throwable->map e)))
          (throw e))))))

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
  (setup-tracking-dataset!)
  (destroy-dataset! "metabase_test_tracking")
  (destroy-dataset! (test-dataset-id (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))
  (tx/track-dataset :bigquery-cloud-sdk (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data)))
  (dataset-tracked?! (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'attempted-murders)))

  (execute! "select name from `%s`.metabase_test_tracking.datasets order by accessed_at" (project-id))
  (database-exists?! (tx/get-dataset-definition (data.impl/resolve-dataset-definition *ns* 'test-data))))

(defn ^:private get-test-data-name
  []
  (test-dataset-id
   (tx/get-dataset-definition (or data.impl/*dbdef-used-to-create-db*
                                  (tx/default-dataset :bigquery-cloud-sdk)))))

(defmethod sql.tx/session-schema :bigquery-cloud-sdk [_driver] (get-test-data-name))

;;; ------------------------------------------------ Fake Sync Support ------------------------------------------------

;; Enable fake sync for BigQuery on feature branches.
;; Fake sync skips network calls to the database for metadata sync, saving CI time.
;; On master/release branches, use real sync to catch any sync regressions.
(defmethod driver/database-supports? [:bigquery-cloud-sdk :test/use-fake-sync]
  [_driver _feature _database]
  (not (tx/on-master-or-release-branch?)))

(defmethod tx/fake-sync-schema :bigquery-cloud-sdk
  [_driver]
  ;; BigQuery uses the dataset ID as the "schema" in Metabase's table metadata.
  ;; Unlike Snowflake (which has a static "PUBLIC" schema), BigQuery's schema IS
  ;; the dataset ID (e.g., "sha_abc123_test_data").
  ;; This works because *dbdef-used-to-create-db* is bound during fake-sync.
  (get-test-data-name))

(defmethod tx/fake-sync-table-name :bigquery-cloud-sdk
  [_driver _database-name table-name]
  ;; BigQuery uses separate datasets per test database, so table names are NOT prefixed.
  ;; E.g., just "venues" not "test_data_venues" (unlike Redshift).
  ;; IMPORTANT: Must normalize names (hyphens → underscores) to match what BigQuery actually stores.
  ;; The physical table is created with normalize-name, so sync sees "bird_count" not "bird-count".
  (normalize-name table-name))

(defmethod tx/fake-sync-database-type :bigquery-cloud-sdk
  [_driver base-type]
  ;; Return database_type as BigQuery reports it in INFORMATION_SCHEMA.
  ;; These match the normalized types from raw-type->database+base-type.
  (case base-type
    :type/BigInteger         "INTEGER"
    :type/Boolean            "BOOLEAN"
    :type/Date               "DATE"
    :type/DateTime           "DATETIME"
    :type/DateTimeWithTZ     "TIMESTAMP"
    :type/DateTimeWithLocalTZ "TIMESTAMP"
    :type/Decimal            "BIGNUMERIC"
    :type/Float              "FLOAT"
    :type/Integer            "INTEGER"
    :type/Number             "INTEGER"
    :type/Text               "STRING"
    :type/Time               "TIME"
    ;; Fallback: use existing base-type->bigquery-type and stringify
    (some-> (base-type->bigquery-type base-type) name)))

(defmethod tx/fake-sync-base-type :bigquery-cloud-sdk
  [_driver base-type]
  ;; BigQuery's TIMESTAMP type maps to :type/DateTimeWithLocalTZ in sync.
  ;; See database-type->base-type in bigquery_cloud_sdk.clj
  (case base-type
    :type/DateTimeWithTZ         :type/DateTimeWithLocalTZ
    :type/DateTimeWithZoneID     :type/DateTimeWithLocalTZ
    :type/DateTimeWithZoneOffset :type/DateTimeWithLocalTZ
    ;; Other types pass through unchanged
    base-type))
