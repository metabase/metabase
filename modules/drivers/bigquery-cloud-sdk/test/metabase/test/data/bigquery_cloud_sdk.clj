(ns metabase.test.data.bigquery-cloud-sdk
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test.data :as data]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.google.cloud.bigquery BigQuery BigQuery$DatasetDeleteOption BigQuery$DatasetListOption BigQuery$DatasetOption
                              BigQuery$TableListOption BigQuery$TableOption Dataset DatasetId DatasetInfo Field
                              InsertAllRequest InsertAllRequest$RowToInsert InsertAllResponse LegacySQLTypeName Schema
                              StandardTableDefinition TableId TableInfo TableResult)))

(set! *warn-on-reflection* true)

(sql.tx/add-test-extensions! :bigquery-cloud-sdk)

(defonce ^:private ns-load-time (System/currentTimeMillis))

;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins are still
;; allowed, which puts us in a weird position, however; people can manually specifiy "foreign key" relationships in
;; admin and everything should work correctly. Since we can't infer any "FK" relationships during sync our normal FK
;; tests are not appropriate for BigQuery, so they're disabled for the time being.
;;
;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set up these FK
;; relationships for FK tables
(defmethod driver/database-supports? [:bigquery-cloud-sdk :foreign-keys]
  [_driver _feature _db]
  (if config/is-test?
    qp.test-util/*enable-fk-support-for-disabled-drivers-in-tests*
    true))


;;; ----------------------------------------------- Connection Details -----------------------------------------------

(defn normalize-name
  "Returns a normalized name for a test database or table"
  [identifier]
  (str/replace (name identifier) "-" "_"))

(defn test-dataset-id
  "All databases created during test runs by this JVM instance get a suffix based on the timestamp from when
   this namespace was loaded. This dataset will not be deleted after this test run finishes, since there is no
   reasonable hook to do so (from this test extension namespace), so instead we will rely on each run cleaning
  up outdated, transient datasets via the `transient-dataset-outdated?` mechanism."
  [database-name]
  (let [s (normalize-name database-name)]
    (str "v3_" s "__transient_" ns-load-time)))

(defn- test-db-details []
  (reduce
     (fn [acc env-var]
       (assoc acc env-var (tx/db-test-env-var :bigquery-cloud-sdk env-var)))
     {}
     [:project-id :service-account-json]))

(defn- bigquery
  "Get an instance of a `Bigquery` client."
  ^BigQuery []
  (#'bigquery/database-details->client (test-db-details)))

(defn project-id
  "BigQuery project ID that we're using for tests, either from the env var `MB_BIGQUERY_TEST_PROJECT_ID`, or if that is
  not set, from the BigQuery client instance itself (which ultimately comes from the value embedded in the service
  account JSON)."
  ^String []
  (let [details (test-db-details)
        bq      (bigquery)]
    (or (:project-id details) (.. bq getOptions getProjectId))))

(defmethod tx/dbdef->connection-details :bigquery-cloud-sdk
  [_driver _context {:keys [database-name]}]
  (assoc (test-db-details)
         :dataset-filters-type "inclusion"
         :dataset-filters-patterns (test-dataset-id database-name)
         :include-user-id-and-hash true))


;;; -------------------------------------------------- Loading Data --------------------------------------------------

(defmethod ddl.i/format-name :bigquery-cloud-sdk
  [_driver table-or-field-name]
  (str/replace table-or-field-name #"-" "_"))

(defn- create-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (.create (bigquery) (DatasetInfo/of (DatasetId/of (project-id) dataset-id)) (u/varargs BigQuery$DatasetOption))
  (log/info (u/format-color 'blue "Created BigQuery dataset `%s.%s`." (project-id) dataset-id)))

(defn- destroy-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (.delete (bigquery) dataset-id (u/varargs
                                   BigQuery$DatasetDeleteOption
                                   [(BigQuery$DatasetDeleteOption/deleteContents)]))
  (log/infof "Deleted BigQuery dataset `%s.%s`." (project-id) dataset-id))

(defn execute!
  "Execute arbitrary (presumably DDL) SQL statements against the test project. Waits for statement to complete, throwing
  an Exception if it fails."
  ^TableResult [format-string & args]
  (driver/with-driver :bigquery-cloud-sdk
    (let [sql (apply format format-string args)]
      (log/infof "[BigQuery] %s\n" sql)
      (flush)
      (#'bigquery/execute-bigquery-on-db (data/db) sql nil nil nil))))

(def ^:private valid-field-types
  #{:BOOLEAN :DATE :DATETIME :FLOAT :INTEGER :NUMERIC :RECORD :STRING :TIME :TIMESTAMP})

;; Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be at most 128
;; characters long.
(def ^:private ValidFieldName
  [:re #"^[A-Za-z_]\w{0,127}$"])

(mu/defn ^:private delete-table!
  [dataset-id :- ::lib.schema.common/non-blank-string
   table-id   :- ::lib.schema.common/non-blank-string]
  (.delete (bigquery) (TableId/of dataset-id table-id))
  (log/error (u/format-color 'red "Deleted table `%s.%s.%s`" (project-id) dataset-id table-id)))

(mu/defn ^:private create-table!
  [^String dataset-id :- ::lib.schema.common/non-blank-string
   ^String table-id   :- ::lib.schema.common/non-blank-string
   field-name->type   :- [:map-of ValidFieldName (into [:enum] valid-field-types)]]
  (u/ignore-exceptions
   (delete-table! dataset-id table-id))
  (let [tbl-id (TableId/of dataset-id table-id)
        schema (Schema/of (u/varargs Field (for [[^String field-name field-type] field-name->type]
                                             (Field/of
                                               field-name
                                               (LegacySQLTypeName/valueOf (name field-type))
                                               (u/varargs Field [])))))
        tbl    (TableInfo/of tbl-id (StandardTableDefinition/of schema))]
    (.create (bigquery) tbl (u/varargs BigQuery$TableOption)))
  ;; now verify that the Table was created
  (.listTables (bigquery) dataset-id (u/varargs BigQuery$TableListOption))
  (log/info (u/format-color 'blue "Created BigQuery table `%s.%s.%s`." (project-id) dataset-id table-id)))

(defn- table-row-count ^Integer [^String dataset-id, ^String table-id]
  (let [sql                           (format "SELECT count(*) FROM `%s.%s.%s`" (project-id) dataset-id table-id)
        respond                       (fn [_ rows]
                                        (ffirst rows))
        client                        (bigquery)
        ^TableResult query-response   (#'bigquery/execute-bigquery client sql [] nil nil)]
    (#'bigquery/post-process-native respond query-response (atom false))))

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
  (->insertable [t] (u.date/format-sql t))

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
    (u.date/format-sql (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; Convert the HoneySQL `timestamp(...)` form we sometimes use to wrap a `Timestamp` to a plain literal string
  honeysql.types.SqlCall
  (->insertable [{[{s :literal}] :args, fn-name :name}]
    (assert (= (name fn-name) "timestamp"))
    (->insertable (u.date/parse (str/replace s #"'" "")))))

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

(defn base-type->bigquery-type [base-type]
  (let [types {:type/BigInteger     :INTEGER
               :type/Boolean        :BOOLEAN
               :type/Date           :DATE
               :type/DateTime       :DATETIME
               :type/DateTimeWithTZ :TIMESTAMP
               :type/Decimal        :NUMERIC
               :type/Dictionary     :RECORD
               :type/Float          :FLOAT
               :type/Integer        :INTEGER
               :type/Text           :STRING
               :type/Time           :TIME}]
    (or (get types base-type)
        (some base-type->bigquery-type (parents base-type)))))

(defn- fielddefs->field-name->base-type
  "Convert `field-definitions` to a format appropriate for passing to `create-table!`."
  [field-definitions]
  (into
   (ordered-map/ordered-map)
   (cons
    ["id" :INTEGER]
    (for [{:keys [field-name base-type]} field-definitions]
      [field-name (or (base-type->bigquery-type base-type)
                      (let [message (format "Don't know what BigQuery type to use for base type: %s" base-type)]
                        (log/error (u/format-color 'red message))
                        (throw (ex-info message {:metabase.util/no-auto-retry? true}))))]))))

(defn- tabledef->prepared-rows
  "Convert `table-definition` to a format approprate for passing to `insert-data!`."
  [{:keys [field-definitions rows]}]
  {:pre [(every? map? field-definitions) (sequential? rows) (seq rows)]}
  (let [field-names (map :field-name field-definitions)]
    (for [[i row] (m/indexed rows)]
      (assoc (zipmap field-names row)
             :id (inc i)))))

(defn- load-tabledef! [dataset-id {:keys [table-name field-definitions], :as tabledef}]
  (let [table-name (normalize-name table-name)]
    (create-table! dataset-id table-name (fielddefs->field-name->base-type field-definitions))
    ;; retry the `insert-data!` step up to 5 times because it seens to fail silently a lot. Since each row is given a
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
            (throw e)))))))

(defn- get-all-datasets
  "Fetch a list of *all* dataset names that currently exist in the BQ test project."
  []
  (for [^Dataset dataset (.iterateAll (.listDatasets (bigquery) (into-array BigQuery$DatasetListOption [])))]
    (.. dataset getDatasetId getDataset)))

(defn- transient-dataset-outdated?
  "Checks whether the given `dataset-id` is a transient dataset that is outdated, and should be deleted.  Note that
  this doesn't need any domain specific knowledge about which transient datasets are
  outdated. The fact that a *created* dataset (i.e. created on BigQuery) is transient has already been encoded by a
  suffix, so we can just look for that here."
  [dataset-id]
  (when-let [[_ ^String ds-timestamp-str] (re-matches #".*__transient_(\d+)$" dataset-id)]
    ;; millis to hours
    (< (* 1000 60 60 2) (- ns-load-time (Long. ds-timestamp-str)))))

(defmethod tx/create-db! :bigquery-cloud-sdk [_ {:keys [database-name table-definitions]} & _]
  {:pre [(seq database-name) (sequential? table-definitions)]}
  ;; clean up outdated datasets
  (doseq [outdated (filter transient-dataset-outdated? (get-all-datasets))]
    (log/info (u/format-color 'blue "Deleting temporary dataset more than two hours old: %s`." outdated))
    (u/ignore-exceptions
     (destroy-dataset! outdated)))
  (let [dataset-id (test-dataset-id database-name)]
    (u/auto-retry 2
     (try
       (log/infof "Creating dataset %s..." (pr-str dataset-id))
       ;; if the dataset failed to load successfully last time around, destroy whatever was loaded so we start
       ;; again from a blank slate
       (u/ignore-exceptions
        (destroy-dataset! dataset-id))
       (create-dataset! dataset-id)
       ;; now create tables and load data.
       (doseq [tabledef table-definitions]
         (load-tabledef! dataset-id tabledef))
       (log/info (u/format-color 'green "Successfully created %s." (pr-str dataset-id)))
       (catch Throwable e
         (log/error (u/format-color 'red  "Failed to load BigQuery dataset %s." (pr-str dataset-id)))
         (log/error (u/pprint-to-str 'red (Throwable->map e)))
         (throw e))))))

(defmethod tx/destroy-db! :bigquery-cloud-sdk
  [_ {:keys [database-name]}]
  (destroy-dataset! (test-dataset-id database-name)))

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
